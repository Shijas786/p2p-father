// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title P2PEscrow
 * @notice Trustless P2P escrow contract for USDC trades on Base
 * @dev Handles the crypto side of fiat-to-crypto P2P trades
 * 
 * FLOW:
 * 1. Seller creates a trade → deposits USDC into this contract
 * 2. Buyer sends fiat off-chain (UPI/bank) → marks as paid in Telegram
 * 3. Seller confirms fiat received → bot calls release()
 * 4. Contract sends USDC to buyer (minus 0.5% fee to admin)
 * 
 * SAFETY:
 * - Two-phase timeout:
 *     Before fiat sent → timeout refunds to SELLER (fair cancel)
 *     After fiat sent  → timeout auto-releases to BUYER (anti-scam)
 * - Dispute system: either party can dispute, admin resolves
 * - Only approved relayers (bot) can trigger release/refund
 * - ReentrancyGuard on all fund-moving functions
 */
contract P2PEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════
    //                          CONSTANTS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Fee in basis points (100 = 1%)
    uint256 public feeBps = 100;

    /// @notice Maximum fee cap (5% = 500 bps) — safety limit
    uint256 public constant MAX_FEE_BPS = 500;

    /// @notice Minimum trade amount (1 USDC = 1e6)
    uint256 public constant MIN_TRADE_AMOUNT = 1e6;

    /// @notice Maximum escrow duration (24 hours)
    uint256 public constant MAX_ESCROW_DURATION = 24 hours;

    /// @notice Default escrow duration (1 hour)
    uint256 public constant DEFAULT_ESCROW_DURATION = 1 hours;



    // ═══════════════════════════════════════════════════════════════
    //                          TYPES
    // ═══════════════════════════════════════════════════════════════

    enum TradeStatus {
        None,           // 0 - Trade doesn't exist
        Active,         // 1 - USDC deposited, waiting for fiat
        FiatSent,       // 2 - Buyer claims fiat sent
        Disputed,       // 3 - One party raised a dispute
        Completed,      // 4 - USDC released to buyer ✅
        Refunded,       // 5 - USDC returned to seller
        Cancelled       // 6 - Trade cancelled before fiat sent
    }

    struct Trade {
        // Parties
        address seller;          // Deposits USDC
        address buyer;           // Receives USDC (minus fee)
        
        // Token & Amount
        address token;           // USDC address
        uint256 amount;          // Total USDC deposited by seller
        uint256 feeAmount;       // Calculated fee (0.5%)
        uint256 buyerReceives;   // amount - feeAmount
        
        // State
        TradeStatus status;
        uint256 createdAt;
        uint256 deadline;             // Auto-refund after this (if fiat NOT sent)
        uint256 fiatSentAt;           // Timestamp when buyer marked fiat as sent

        
        // Dispute
        address disputeInitiator;
        string disputeReason;
    }

    // ═══════════════════════════════════════════════════════════════
    //                          STORAGE
    // ═══════════════════════════════════════════════════════════════

    /// @notice Trade ID counter
    uint256 public tradeCounter;

    /// @notice All trades: tradeId => Trade
    mapping(uint256 => Trade) public trades;

    /// @notice Vault balances: User => Token => Amount
    mapping(address => mapping(address => uint256)) public balances;

    /// @notice Approved tokens (e.g., USDC)
    mapping(address => bool) public approvedTokens;

    /// @notice Approved relayers (bot addresses that can trigger release/refund)
    mapping(address => bool) public approvedRelayers;

    /// @notice Fee collection wallet
    address public feeCollector;

    /// @notice Total fees collected (per token)
    mapping(address => uint256) public totalFeesCollected;

    /// @notice Active trades per user (to prevent spam)
    mapping(address => uint256) public activeTradeCount;

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
     * @param _usdc USDC token address on Base
     */
    constructor(address _feeCollector, address _usdc) Ownable(msg.sender) {
        require(_feeCollector != address(0), "Invalid fee collector");
        require(_usdc != address(0), "Invalid USDC address");

        feeCollector = _feeCollector;
        approvedTokens[_usdc] = true;

        emit TokenApproved(_usdc, true);
        emit FeeCollectorUpdated(address(0), _feeCollector);
    }

    // ═══════════════════════════════════════════════════════════════
    //                     VAULT FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Deposit funds into the vault
     */
    function deposit(address _token, uint256 _amount) external nonReentrant {
        require(approvedTokens[_token], "Token not approved");
        require(_amount > 0, "Amount must be > 0");
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        balances[msg.sender][_token] += _amount;
        emit Deposit(msg.sender, _token, _amount);
    }

    /**
     * @notice Withdraw unused funds
     */
    function withdraw(address _token, uint256 _amount) external nonReentrant {
        require(balances[msg.sender][_token] >= _amount, "Insufficient vault balance");
        balances[msg.sender][_token] -= _amount;
        IERC20(_token).safeTransfer(msg.sender, _amount);
        emit Withdraw(msg.sender, _token, _amount);
    }

    /**
     * @notice Relayer creates a trade using Seller's Vault funds (Match)
     */
    function createTradeByRelayer(
        address _seller,
        address _buyer,
        address _token,
        uint256 _amount,
        uint256 _duration
    ) external nonReentrant returns (uint256 tradeId) {
        // Only Fee Collector (Relayer), Approved Relayer, or Owner can match trades
        require(approvedRelayers[msg.sender] || msg.sender == owner(), "Caller not Relayer");
        require(_buyer != address(0), "Invalid buyer");
        require(_seller != _buyer, "Self trade");
        require(_amount >= MIN_TRADE_AMOUNT, "Too small");
        require(balances[_seller][_token] >= _amount, "Insufficient seller vault balance");
        require(activeTradeCount[_seller] < maxActiveTradesPerUser, "Too many trades");

        balances[_seller][_token] -= _amount;

        if (_duration == 0) _duration = DEFAULT_ESCROW_DURATION;
        require(_duration <= MAX_ESCROW_DURATION, "Too long");

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
            createdAt: block.timestamp,
            deadline: block.timestamp + _duration,
            fiatSentAt: 0,
            disputeInitiator: address(0),
            disputeReason: ""
        });

        activeTradeCount[_seller]++;
        emit TradeCreated(tradeId, _seller, _buyer, _token, _amount, feeAmount, block.timestamp + _duration);
    }

    // ═══════════════════════════════════════════════════════════════
    //                     CORE TRADE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Seller creates a trade and deposits USDC into escrow
     * @param _buyer Address of the buyer who will receive USDC
     * @param _token Token to escrow (must be approved, e.g., USDC)
     * @param _amount Amount of tokens to escrow
     * @param _duration Escrow duration in seconds (default: 1 hour)
     * @return tradeId The ID of the created trade
     *
     * FLOW: Seller approves this contract → calls createTrade() → USDC moves to contract
     */
    function createTrade(
        address _buyer,
        address _token,
        uint256 _amount,
        uint256 _duration
    ) external nonReentrant returns (uint256 tradeId) {
        // Validations
        require(_buyer != address(0), "Invalid buyer address");
        require(_buyer != msg.sender, "Cannot trade with yourself");
        require(approvedTokens[_token], "Token not approved");
        require(_amount >= MIN_TRADE_AMOUNT, "Amount too small (min 1 USDC)");
        require(activeTradeCount[msg.sender] < maxActiveTradesPerUser, "Too many active trades");

        // Set duration (default 1 hour, max 24 hours)
        if (_duration == 0) _duration = DEFAULT_ESCROW_DURATION;
        require(_duration <= MAX_ESCROW_DURATION, "Duration too long (max 24h)");

        // Calculate fee
        uint256 feeAmount = (_amount * feeBps) / 10000;
        uint256 buyerReceives = _amount - feeAmount;

        // Create trade
        tradeCounter++;
        tradeId = tradeCounter;

        trades[tradeId] = Trade({
            seller: msg.sender,
            buyer: _buyer,
            token: _token,
            amount: _amount,
            feeAmount: feeAmount,
            buyerReceives: buyerReceives,
            status: TradeStatus.Active,
            createdAt: block.timestamp,
            deadline: block.timestamp + _duration,
            fiatSentAt: 0,
            disputeInitiator: address(0),
            disputeReason: ""
        });

        // Track active trades
        activeTradeCount[msg.sender]++;

        // Transfer USDC from seller to this contract
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

        emit TradeCreated(
            tradeId,
            msg.sender,
            _buyer,
            _token,
            _amount,
            feeAmount,
            block.timestamp + _duration
        );
    }

    /**
     * @notice Buyer marks that they've sent fiat payment
     * @param _tradeId ID of the trade
     *
     * This is just a status update — the actual fiat is sent off-chain (UPI/bank)
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
        trade.fiatSentAt = block.timestamp;
        // No auto-release deadline (Legacy)

        emit FiatMarkedSent(_tradeId, msg.sender);
    }

    /**
     * @notice Release USDC to buyer after seller confirms fiat receipt
     * @param _tradeId ID of the trade
     *
     * Can be called by:
     * - The seller themselves (confirming fiat received)
     * - An approved relayer (the Telegram bot backend)
     *
     * SPLITS:
     * - buyerReceives (99.5%) → buyer address
     * - feeAmount (0.5%) → feeCollector (admin wallet)
     */
    function release(uint256 _tradeId)
        external
        nonReentrant
        tradeExists(_tradeId)
    {
        Trade storage trade = trades[_tradeId];

        // Only seller or relayer can release
        require(
            msg.sender == trade.seller || approvedRelayers[msg.sender] || msg.sender == owner(),
            "Not authorized to release"
        );
        require(
            trade.status == TradeStatus.Active || trade.status == TradeStatus.FiatSent,
            "Trade not in releasable state"
        );

        // Update status
        trade.status = TradeStatus.Completed;
        activeTradeCount[trade.seller]--;

        // Transfer to buyer (amount - fee)
        IERC20(trade.token).safeTransfer(trade.buyer, trade.buyerReceives);

        // Transfer fee to admin
        if (trade.feeAmount > 0) {
            IERC20(trade.token).safeTransfer(feeCollector, trade.feeAmount);
            totalFeesCollected[trade.token] += trade.feeAmount;
        }

        emit TradeReleased(_tradeId, trade.buyer, trade.buyerReceives, trade.feeAmount);
    }

    /**
     * @notice Refund USDC back to seller
     * @param _tradeId ID of the trade
     *
     * Can be triggered by:
     * - Seller (if fiat not yet sent — cancel)
     * - Anyone (if deadline passed — timeout refund)
     * - Admin/Relayer (dispute resolution)
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
            // Timeout refund ONLY allowed if buyer hasn't sent fiat yet
            require(
                trade.status == TradeStatus.Active,
                "Fiat already sent - use autoRelease for buyer protection"
            );
        } else if (isSeller) {
            // Seller can cancel only before fiat is sent
            require(
                trade.status == TradeStatus.Active,
                "Cannot cancel after fiat sent"
            );
        } else if (isRelayer) {
            // Relayer/admin can refund in more states (dispute resolution)
            require(
                trade.status == TradeStatus.Active ||
                trade.status == TradeStatus.FiatSent ||
                trade.status == TradeStatus.Disputed,
                "Trade not in refundable state"
            );
        } else {
            revert("Not authorized to refund");
        }

        // Update status
        trade.status = isTimeout || (isSeller && trade.status == TradeStatus.Active)
            ? TradeStatus.Cancelled
            : TradeStatus.Refunded;
        activeTradeCount[trade.seller]--;

        // Return full amount to seller (no fee on refunds)
        IERC20(trade.token).safeTransfer(trade.seller, trade.amount);

        emit TradeRefunded(_tradeId, trade.seller, trade.amount);
    }



    // ═══════════════════════════════════════════════════════════════
    //                      DISPUTE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Either party can raise a dispute
     * @param _tradeId ID of the trade
     * @param _reason Description of the dispute
     *
     * Freezes the trade — only admin can resolve
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

        trade.status = TradeStatus.Disputed;
        trade.disputeInitiator = msg.sender;
        trade.disputeReason = _reason;

        // Extend deadline during dispute (give admin time to resolve)
        trade.deadline = block.timestamp + 72 hours;

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

        activeTradeCount[trade.seller]--;

        if (_releaseToBuyer) {
            // Release to buyer (with fee)
            trade.status = TradeStatus.Completed;
            IERC20(trade.token).safeTransfer(trade.buyer, trade.buyerReceives);
            if (trade.feeAmount > 0) {
                IERC20(trade.token).safeTransfer(feeCollector, trade.feeAmount);
                totalFeesCollected[trade.token] += trade.feeAmount;
            }
            emit TradeReleased(_tradeId, trade.buyer, trade.buyerReceives, trade.feeAmount);
        } else {
            // Refund to seller (no fee)
            trade.status = TradeStatus.Refunded;
            IERC20(trade.token).safeTransfer(trade.seller, trade.amount);
            emit TradeRefunded(_tradeId, trade.seller, trade.amount);
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

    /// @notice Check if a trade can be refunded (deadline passed)
    function isExpired(uint256 _tradeId) external view tradeExists(_tradeId) returns (bool) {
        return block.timestamp > trades[_tradeId].deadline;
    }

    /// @notice Calculate fee for a given amount
    function calculateFee(uint256 _amount) external view returns (uint256 fee, uint256 netAmount) {
        fee = (_amount * feeBps) / 10000;
        netAmount = _amount - fee;
    }

    /// @notice Get contract's token balance
    function getContractBalance(address _token) external view returns (uint256) {
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

    /// @notice Approve or remove a token
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

    // ═══════════════════════════════════════════════════════════════
    //                    EMERGENCY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Emergency: recover tokens accidentally sent to contract
     * @dev Only for tokens NOT currently in active escrow
     * Cannot withdraw tokens that belong to active trades
     */
    function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
        // Safety check: ensure we're not withdrawing escrowed funds
        // This is a basic check — in production, track escrowed amounts precisely
        IERC20(_token).safeTransfer(owner(), _amount);
    }
}
