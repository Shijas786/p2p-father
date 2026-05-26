// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title P2PEscrow
 * @notice Trustless P2P escrow contract for fiat-to-crypto trades
 * @dev Handles the crypto side of P2P trades. Supports ERC20 tokens AND native BNB/ETH.
 *
 * FLOW:
 * 1. Seller deposits USDC/USDT/BNB into this contract vault
 * 2. Relayer (bot) creates a trade — locks funds from seller's vault into escrow
 * 3. Buyer sends fiat off-chain (UPI/bank) → marks as paid in Telegram
 * 4. Seller confirms fiat received → bot calls release()
 * 5. Contract sends crypto to buyer (minus 0.5% fee to admin)
 *
 * NATIVE TOKEN:
 * - address(0) is used as the sentinel for native BNB/ETH
 * - deposit() is payable — send msg.value for BNB deposits
 * - createTrade() is payable — seller can directly escrow BNB
 *
 * SAFETY:
 * - Two-phase timeout: before fiat → refund to seller; after fiat → must dispute
 * - Dispute system: either party disputes, admin resolves
 * - Only approved relayers (bot) can trigger release/refund
 * - ReentrancyGuard on all fund-moving functions
 * - Pausable for emergency stop
 */
contract P2PEscrow is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════
    //                          CONSTANTS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Sentinel address for native BNB/ETH (matches bot's address(0) convention)
    address public constant NATIVE_TOKEN = address(0);

    /// @notice Fee in basis points (50 = 0.5%)
    uint256 public feeBps = 50;

    /// @notice Maximum fee cap (5% = 500 bps) — safety limit
    uint256 public constant MAX_FEE_BPS = 500;

    /// @notice Minimum trade amount (sanity check — bot validates proper amounts)
    uint256 public constant MIN_TRADE_AMOUNT = 1e6;

    /// @notice Maximum escrow duration (24 hours)
    uint256 public constant MAX_ESCROW_DURATION = 24 hours;

    /// @notice Default escrow duration (30 minutes)
    uint256 public constant DEFAULT_ESCROW_DURATION = 30 minutes;

    // ═══════════════════════════════════════════════════════════════
    //                          TYPES
    // ═══════════════════════════════════════════════════════════════

    enum TradeStatus {
        None,       // 0 - Trade doesn't exist
        Active,     // 1 - Funds deposited, waiting for fiat
        FiatSent,   // 2 - Buyer claims fiat sent
        Disputed,   // 3 - One party raised a dispute
        Completed,  // 4 - Crypto released to buyer ✅
        Refunded,   // 5 - Crypto returned to seller
        Cancelled   // 6 - Trade cancelled before fiat sent
    }

    struct Trade {
        // Slot 0 (29 bytes used)
        address seller;           // 20 bytes
        TradeStatus status;       // 1 byte (enum)
        uint32 createdAt;         // 4 bytes
        uint32 deadline;          // 4 bytes

        // Slot 1 (24 bytes used)
        address buyer;            // 20 bytes
        uint32 fiatSentAt;        // 4 bytes

        // Slot 2
        address token;            // 20 bytes

        // Slot 3
        address disputeInitiator; // 20 bytes

        // Slot 4
        uint256 amount;           // 32 bytes (full trade amount)

        // Slot 5
        uint256 feeAmount;        // 32 bytes (computed once at creation)

        // Slot 6
        uint256 buyerReceives;    // 32 bytes (computed once at creation)
    }

    // ═══════════════════════════════════════════════════════════════
    //                          STORAGE
    // ═══════════════════════════════════════════════════════════════

    /// @notice Trade ID counter
    uint256 public tradeCounter;

    /// @notice All trades: tradeId => Trade
    mapping(uint256 => Trade) public trades;

    /// @notice Vault balances: User => Token => Amount (address(0) = native BNB)
    mapping(address => mapping(address => uint256)) public balances;

    /// @notice Approved tokens (e.g., USDC, USDT, address(0) for native BNB)
    mapping(address => bool) public approvedTokens;

    /// @notice Approved relayers (bot addresses that can trigger release/refund)
    mapping(address => bool) public approvedRelayers;

    /// @notice Fee collection wallet
    address public feeCollector;

    /// @notice Total fees collected (per token, address(0) for native)
    mapping(address => uint256) public totalFeesCollected;

    /// @notice Active trades per user (to prevent spam)
    mapping(address => uint256) public activeTradeCount;

    /// @notice Total vault balances per token
    mapping(address => uint256) public totalVaultBalances;

    /// @notice Total escrowed balances per token
    mapping(address => uint256) public totalEscrowedBalances;

    /// @notice Max active trades per user
    uint256 public maxActiveTradesPerUser = 10;

    // ═══════════════════════════════════════════════════════════════
    //                          EVENTS
    // ═══════════════════════════════════════════════════════════════

    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdraw(address indexed user, address indexed token, uint256 amount);

    event TradeCreated(
        uint256 indexed tradeId,
        address indexed seller,
        address indexed buyer,
        address token,
        uint256 amount,
        uint256 feeAmount,
        uint256 deadline
    );

    event FiatMarkedSent(uint256 indexed tradeId, address indexed buyer);

    event TradeReleased(
        uint256 indexed tradeId,
        address indexed buyer,
        uint256 buyerReceives,
        uint256 feeAmount
    );

    event TradeRefunded(
        uint256 indexed tradeId,
        address indexed seller,
        uint256 amount
    );

    event TradeCancelled(uint256 indexed tradeId, address indexed seller);

    event TradeDisputed(
        uint256 indexed tradeId,
        address indexed initiator,
        string reason
    );

    event DisputeResolved(
        uint256 indexed tradeId,
        address indexed resolver,
        bool releasedToBuyer
    );

    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event TokenApproved(address token, bool approved);
    event RelayerUpdated(address relayer, bool approved);
    event FeeCollectorUpdated(address oldCollector, address newCollector);

    // ═══════════════════════════════════════════════════════════════
    //                          MODIFIERS
    // ═══════════════════════════════════════════════════════════════

    modifier onlyRelayer() {
        require(approvedRelayers[msg.sender] || msg.sender == owner(), "Not authorized relayer");
        _;
    }

    modifier tradeExists(uint256 _tradeId) {
        require(_tradeId > 0 && _tradeId <= tradeCounter, "Trade does not exist");
        _;
    }

    // ═══════════════════════════════════════════════════════════════
    //                        CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    /**
     * @param _feeCollector Address to receive trading fees
     * @param _initialTokens Array of initial approved token addresses (use address(0) for native BNB/ETH)
     */
    constructor(address _feeCollector, address[] memory _initialTokens) Ownable(msg.sender) {
        require(_feeCollector != address(0), "Invalid fee collector");

        feeCollector = _feeCollector;
        emit FeeCollectorUpdated(address(0), _feeCollector);

        for (uint256 i = 0; i < _initialTokens.length; i++) {
            approvedTokens[_initialTokens[i]] = true;
            emit TokenApproved(_initialTokens[i], true);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //                    NATIVE BNB RECEIVER
    // ═══════════════════════════════════════════════════════════════

    /// @notice Accept native BNB sent directly (e.g., from deposit calls)
    receive() external payable {}

    // ═══════════════════════════════════════════════════════════════
    //                    INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════

    /**
     * @dev Transfer tokens out of the contract — handles native BNB and ERC20 uniformly.
     * Always called after state updates (checks-effects-interactions pattern).
     */
    function _transferOut(address _token, address _to, uint256 _amount) internal {
        if (_token == NATIVE_TOKEN) {
            (bool success, ) = _to.call{value: _amount}("");
            require(success, "Native transfer failed");
        } else {
            IERC20(_token).safeTransfer(_to, _amount);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //                     VAULT FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Deposit funds into the vault
     * @dev For native BNB: pass token=address(0), amount=X, and send msg.value=X
     *      For ERC20: pass token=tokenAddress, amount=X, msg.value must be 0
     */
    function deposit(address _token, uint256 _amount) external payable nonReentrant whenNotPaused {
        require(approvedTokens[_token], "Token not approved");
        require(_amount > 0, "Amount must be > 0");

        if (_token == NATIVE_TOKEN) {
            // Native BNB deposit
            require(msg.value == _amount, "BNB amount mismatch");
        } else {
            // ERC20 deposit
            require(msg.value == 0, "Do not send BNB with ERC20 deposit");
            IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        }

        balances[msg.sender][_token] += _amount;
        totalVaultBalances[_token] += _amount;
        emit Deposit(msg.sender, _token, _amount);
    }

    /**
     * @notice Withdraw unused funds from vault
     */
    function withdraw(address _token, uint256 _amount) external nonReentrant {
        require(balances[msg.sender][_token] >= _amount, "Insufficient vault balance");

        // Effects first
        balances[msg.sender][_token] -= _amount;
        totalVaultBalances[_token] -= _amount;

        // Interaction last
        _transferOut(_token, msg.sender, _amount);
        emit Withdraw(msg.sender, _token, _amount);
    }

    /**
     * @notice Relayer creates a trade using Seller's Vault funds
     */
    function createTradeByRelayer(
        address _seller,
        address _buyer,
        address _token,
        uint256 _amount,
        uint256 _duration
    ) external nonReentrant whenNotPaused returns (uint256 tradeId) {
        require(approvedRelayers[msg.sender] || msg.sender == owner(), "Caller not Relayer");
        require(_buyer != address(0), "Invalid buyer");
        require(_seller != _buyer, "Self trade");
        require(approvedTokens[_token], "Token not approved");
        require(_amount >= MIN_TRADE_AMOUNT, "Too small");
        require(balances[_seller][_token] >= _amount, "Insufficient seller vault balance");
        require(activeTradeCount[_seller] < maxActiveTradesPerUser, "Seller too many active trades");
        require(activeTradeCount[_buyer] < maxActiveTradesPerUser, "Buyer too many active trades");

        // Move from vault to escrow (pure accounting — no external transfer)
        balances[_seller][_token] -= _amount;
        totalVaultBalances[_token] -= _amount;
        totalEscrowedBalances[_token] += _amount;

        if (_duration == 0) _duration = DEFAULT_ESCROW_DURATION;
        require(_duration <= MAX_ESCROW_DURATION, "Duration too long");
        require(block.timestamp + _duration <= type(uint32).max, "Timestamp overflow");

        uint256 feeAmount = (_amount * feeBps) / 10000;
        uint256 buyerReceives = _amount - feeAmount;

        tradeCounter++;
        tradeId = tradeCounter;

        trades[tradeId] = Trade({
            seller: _seller,
            buyer: _buyer,
            token: _token,
            amount: _amount,
            feeAmount: feeAmount,
            buyerReceives: buyerReceives,
            status: TradeStatus.Active,
            createdAt: uint32(block.timestamp),
            deadline: uint32(block.timestamp + _duration),
            fiatSentAt: 0,
            disputeInitiator: address(0)
        });

        activeTradeCount[_seller]++;
        activeTradeCount[_buyer]++;

        emit TradeCreated(tradeId, _seller, _buyer, _token, _amount, feeAmount, block.timestamp + _duration);
    }

    // ═══════════════════════════════════════════════════════════════
    //                     CORE TRADE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Seller creates a trade and directly deposits crypto into escrow
     * @dev For native BNB: pass token=address(0), amount=X, send msg.value=X
     *      For ERC20: pass token=tokenAddr, amount=X, msg.value must be 0
     */
    function createTrade(
        address _buyer,
        address _token,
        uint256 _amount,
        uint256 _duration
    ) external payable nonReentrant whenNotPaused returns (uint256 tradeId) {
        require(_buyer != address(0), "Invalid buyer address");
        require(_buyer != msg.sender, "Cannot trade with yourself");
        require(approvedTokens[_token], "Token not approved");
        require(_amount >= MIN_TRADE_AMOUNT, "Amount too small");
        require(activeTradeCount[msg.sender] < maxActiveTradesPerUser, "Too many active trades");
        require(activeTradeCount[_buyer] < maxActiveTradesPerUser, "Buyer too many active trades");

        if (_duration == 0) _duration = DEFAULT_ESCROW_DURATION;
        require(_duration <= MAX_ESCROW_DURATION, "Duration too long (max 24h)");
        require(block.timestamp + _duration <= type(uint32).max, "Timestamp overflow");

        // Collect funds
        if (_token == NATIVE_TOKEN) {
            require(msg.value == _amount, "BNB amount mismatch");
        } else {
            require(msg.value == 0, "Do not send BNB with ERC20 trade");
            IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        }

        uint256 feeAmount = (_amount * feeBps) / 10000;
        uint256 buyerReceives = _amount - feeAmount;

        tradeCounter++;
        tradeId = tradeCounter;
        totalEscrowedBalances[_token] += _amount;

        trades[tradeId] = Trade({
            seller: msg.sender,
            buyer: _buyer,
            token: _token,
            amount: _amount,
            feeAmount: feeAmount,
            buyerReceives: buyerReceives,
            status: TradeStatus.Active,
            createdAt: uint32(block.timestamp),
            deadline: uint32(block.timestamp + _duration),
            fiatSentAt: 0,
            disputeInitiator: address(0)
        });

        activeTradeCount[msg.sender]++;
        activeTradeCount[_buyer]++;

        emit TradeCreated(tradeId, msg.sender, _buyer, _token, _amount, feeAmount, block.timestamp + _duration);
    }

    /**
     * @notice Buyer marks that they've sent fiat payment
     * @param _tradeId ID of the trade
     */
    function markFiatSent(uint256 _tradeId)
        external
        tradeExists(_tradeId)
    {
        Trade storage trade = trades[_tradeId];
        require(msg.sender == trade.buyer, "Only buyer can mark fiat sent");
        require(trade.status == TradeStatus.Active, "Trade not active");
        require(block.timestamp <= trade.deadline, "Trade expired");

        trade.status = TradeStatus.FiatSent;
        trade.fiatSentAt = uint32(block.timestamp);

        emit FiatMarkedSent(_tradeId, msg.sender);
    }

    /**
     * @notice Release crypto to buyer after seller confirms fiat receipt
     * @param _tradeId ID of the trade
     *
     * Can be called by:
     * - The seller themselves
     * - An approved relayer (Telegram bot)
     */
    function release(uint256 _tradeId)
        external
        nonReentrant
        tradeExists(_tradeId)
    {
        Trade storage trade = trades[_tradeId];

        require(
            msg.sender == trade.seller || approvedRelayers[msg.sender] || msg.sender == owner(),
            "Not authorized to release"
        );
        require(
            trade.status == TradeStatus.Active || trade.status == TradeStatus.FiatSent,
            "Trade not in releasable state"
        );

        // Effects first
        trade.status = TradeStatus.Completed;
        activeTradeCount[trade.seller]--;
        activeTradeCount[trade.buyer]--;
        totalEscrowedBalances[trade.token] -= trade.amount;

        // Cache before interactions
        address token = trade.token;
        address buyer = trade.buyer;
        uint256 buyerReceives = trade.buyerReceives;
        uint256 feeAmount = trade.feeAmount;

        // Interactions last
        _transferOut(token, buyer, buyerReceives);
        if (feeAmount > 0) {
            _transferOut(token, feeCollector, feeAmount);
            totalFeesCollected[token] += feeAmount;
        }

        emit TradeReleased(_tradeId, buyer, buyerReceives, feeAmount);
    }

    /**
     * @notice Refund crypto back to seller
     * @param _tradeId ID of the trade
     */
    function refund(uint256 _tradeId)
        external
        nonReentrant
        tradeExists(_tradeId)
    {
        Trade storage trade = trades[_tradeId];

        bool isTimeout = block.timestamp > trade.deadline;
        bool isSeller = msg.sender == trade.seller;
        bool isRelayer = approvedRelayers[msg.sender] || msg.sender == owner();

        if (isTimeout) {
            // Timeout: only if fiat NOT yet sent
            require(
                trade.status == TradeStatus.Active,
                "Fiat already sent - raise a dispute"
            );
        } else if (isSeller) {
            // Seller cancel: only before fiat sent
            require(
                trade.status == TradeStatus.Active,
                "Cannot cancel after fiat sent"
            );
        } else if (isRelayer) {
            // Relayer/admin can refund in dispute resolution
            require(
                trade.status == TradeStatus.Active ||
                trade.status == TradeStatus.FiatSent ||
                trade.status == TradeStatus.Disputed,
                "Trade not in refundable state"
            );
        } else {
            revert("Not authorized to refund");
        }

        // Effects first
        trade.status = isTimeout || (isSeller && trade.status == TradeStatus.Active)
            ? TradeStatus.Cancelled
            : TradeStatus.Refunded;
        activeTradeCount[trade.seller]--;
        activeTradeCount[trade.buyer]--;
        totalEscrowedBalances[trade.token] -= trade.amount;

        // Cache before interaction
        address token = trade.token;
        address seller = trade.seller;
        uint256 amount = trade.amount;

        // Interaction last — return full amount, no fee on refunds
        _transferOut(token, seller, amount);

        emit TradeRefunded(_tradeId, seller, amount);
    }

    // ═══════════════════════════════════════════════════════════════
    //                      DISPUTE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Either party can raise a dispute
     * @param _tradeId ID of the trade
     * @param _reason Description of the dispute
     */
    function raiseDispute(uint256 _tradeId, string calldata _reason)
        external
        tradeExists(_tradeId)
    {
        Trade storage trade = trades[_tradeId];

        require(
            msg.sender == trade.seller || msg.sender == trade.buyer,
            "Only trade parties can dispute"
        );
        require(
            trade.status == TradeStatus.Active || trade.status == TradeStatus.FiatSent,
            "Trade not in disputable state"
        );
        require(trade.disputeInitiator == address(0), "Dispute already initiated");
        require(block.timestamp + 72 hours <= type(uint32).max, "Timestamp overflow");

        trade.status = TradeStatus.Disputed;
        trade.disputeInitiator = msg.sender;

        // Extend deadline — give admin 72h to resolve
        trade.deadline = uint32(block.timestamp + 72 hours);

        emit TradeDisputed(_tradeId, msg.sender, _reason);
    }

    /**
     * @notice Admin resolves a dispute
     * @param _tradeId ID of the trade
     * @param _releaseToBuyer true = send to buyer, false = refund to seller
     */
    function resolveDispute(uint256 _tradeId, bool _releaseToBuyer)
        external
        nonReentrant
        tradeExists(_tradeId)
    {
        require(
            approvedRelayers[msg.sender] || msg.sender == owner(),
            "Only admin/relayer can resolve"
        );

        Trade storage trade = trades[_tradeId];
        require(trade.status == TradeStatus.Disputed, "Trade not disputed");

        // Effects first
        activeTradeCount[trade.seller]--;
        activeTradeCount[trade.buyer]--;
        totalEscrowedBalances[trade.token] -= trade.amount;

        // Cache before interactions
        address token = trade.token;
        address buyer = trade.buyer;
        address seller = trade.seller;
        uint256 buyerReceives = trade.buyerReceives;
        uint256 feeAmount = trade.feeAmount;
        uint256 amount = trade.amount;

        if (_releaseToBuyer) {
            trade.status = TradeStatus.Completed;
            _transferOut(token, buyer, buyerReceives);
            if (feeAmount > 0) {
                _transferOut(token, feeCollector, feeAmount);
                totalFeesCollected[token] += feeAmount;
            }
            emit TradeReleased(_tradeId, buyer, buyerReceives, feeAmount);
        } else {
            trade.status = TradeStatus.Refunded;
            _transferOut(token, seller, amount);
            emit TradeRefunded(_tradeId, seller, amount);
        }

        emit DisputeResolved(_tradeId, msg.sender, _releaseToBuyer);
    }

    // ═══════════════════════════════════════════════════════════════
    //                       VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Get full trade details
    function getTrade(uint256 _tradeId) external view returns (Trade memory) {
        return trades[_tradeId];
    }

    /// @notice Check if a trade's deadline has passed
    function isExpired(uint256 _tradeId) external view tradeExists(_tradeId) returns (bool) {
        return block.timestamp > trades[_tradeId].deadline;
    }

    /// @notice Calculate fee for a given amount
    function calculateFee(uint256 _amount) external view returns (uint256 fee, uint256 netAmount) {
        fee = (_amount * feeBps) / 10000;
        netAmount = _amount - fee;
    }

    /// @notice Get contract's token balance (address(0) = native BNB)
    function getContractBalance(address _token) external view returns (uint256) {
        if (_token == NATIVE_TOKEN) return address(this).balance;
        return IERC20(_token).balanceOf(address(this));
    }

    // ═══════════════════════════════════════════════════════════════
    //                      ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Update the trading fee (max 5%)
    function setFeeBps(uint256 _newFeeBps) external onlyOwner {
        require(_newFeeBps <= MAX_FEE_BPS, "Fee too high (max 5%)");
        uint256 oldFee = feeBps;
        feeBps = _newFeeBps;
        emit FeeUpdated(oldFee, _newFeeBps);
    }

    /// @notice Approve or remove a token (use address(0) for native BNB)
    function setApprovedToken(address _token, bool _approved) external onlyOwner {
        approvedTokens[_token] = _approved;
        emit TokenApproved(_token, _approved);
    }

    /// @notice Add or remove a relayer (bot backend address)
    function setRelayer(address _relayer, bool _approved) external onlyOwner {
        approvedRelayers[_relayer] = _approved;
        emit RelayerUpdated(_relayer, _approved);
    }

    /// @notice Update the fee collection address
    function setFeeCollector(address _newCollector) external onlyOwner {
        require(_newCollector != address(0), "Invalid address");
        address old = feeCollector;
        feeCollector = _newCollector;
        emit FeeCollectorUpdated(old, _newCollector);
    }

    /// @notice Update max active trades per user
    function setMaxActiveTrades(uint256 _max) external onlyOwner {
        require(_max > 0 && _max <= 50, "Invalid max (1-50)");
        maxActiveTradesPerUser = _max;
    }

    /// @notice Pause the contract (prevents deposits and new trades)
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the contract
    function unpause() external onlyOwner {
        _unpause();
    }

    // ═══════════════════════════════════════════════════════════════
    //                    EMERGENCY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Emergency: recover excess tokens/BNB accidentally sent to contract
     * @dev Cannot withdraw funds that belong to active trades or vault
     */
    function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
        uint256 lockedFunds = totalVaultBalances[_token] + totalEscrowedBalances[_token];

        if (_token == NATIVE_TOKEN) {
            require(address(this).balance >= lockedFunds + _amount, "Cannot withdraw locked BNB");
        } else {
            require(
                IERC20(_token).balanceOf(address(this)) >= lockedFunds + _amount,
                "Cannot withdraw escrowed/vault funds"
            );
        }

        _transferOut(_token, owner(), _amount);
    }
}
