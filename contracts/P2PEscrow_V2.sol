// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title P2PEscrow V2
 * @notice Trustless P2P escrow contract for USDC and Native Assets (ETH/BNB)
 * @dev Handles the crypto side of fiat-to-crypto P2P trades with gas-ready native asset support.
 */
contract P2PEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════
    //                          CONSTANTS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Fee in basis points (100 = 1%)
    uint256 public feeBps = 50; // Optimized to 0.5% default

    /// @notice Maximum fee cap (5% = 500 bps) — safety limit
    uint256 public constant MAX_FEE_BPS = 500;

    /// @notice Maximum escrow duration (24 hours)
    uint256 public constant MAX_ESCROW_DURATION = 24 hours;

    /// @notice Default escrow duration (1 hour)
    uint256 public constant DEFAULT_ESCROW_DURATION = 1 hours;

    // ═══════════════════════════════════════════════════════════════
    //                          TYPES
    // ═══════════════════════════════════════════════════════════════

    enum TradeStatus {
        None,           // 0 - Trade doesn't exist
        Active,         // 1 - Asset deposited, waiting for fiat
        FiatSent,       // 2 - Buyer claims fiat sent
        Disputed,       // 3 - One party raised a dispute
        Completed,      // 4 - Asset released to buyer ✅
        Refunded,       // 5 - Asset returned to seller
        Cancelled       // 6 - Trade cancelled before fiat sent
    }

    struct Trade {
        address seller;          
        address buyer;           
        address token;           // address(0) for native asset (BNB/ETH)
        uint256 amount;          
        uint256 feeAmount;       
        uint256 buyerReceives;   
        TradeStatus status;
        uint256 createdAt;
        uint256 deadline;        
        uint256 fiatSentAt;      
        address disputeInitiator;
        string disputeReason;
    }

    // ═══════════════════════════════════════════════════════════════
    //                          STORAGE
    // ═══════════════════════════════════════════════════════════════

    uint256 public tradeCounter;
    mapping(uint256 => Trade) public trades;
    mapping(address => mapping(address => uint256)) public balances;
    mapping(address => bool) public approvedTokens;
    mapping(address => bool) public approvedRelayers;
    mapping(address => uint256) public minTradeAmount; // Token address => Min Amount
    address public feeCollector;
    mapping(address => uint256) public totalFeesCollected;
    mapping(address => uint256) public activeTradeCount;
    uint256 public maxActiveTradesPerUser = 10;

    // ═══════════════════════════════════════════════════════════════
    //                          EVENTS
    // ═══════════════════════════════════════════════════════════════

    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdraw(address indexed user, address indexed token, uint256 amount);
    event TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, address token, uint256 amount, uint256 feeAmount, uint256 deadline);
    event FiatMarkedSent(uint256 indexed tradeId, address indexed buyer);
    event TradeReleased(uint256 indexed tradeId, address indexed buyer, uint256 buyerReceives, uint256 feeAmount);
    event TradeRefunded(uint256 indexed tradeId, address indexed seller, uint256 amount);
    event TradeCancelled(uint256 indexed tradeId, address indexed seller);
    event TradeDisputed(uint256 indexed tradeId, address indexed initiator, string reason);
    event DisputeResolved(uint256 indexed tradeId, address indexed resolver, bool releasedToBuyer);
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event TokenApproved(address token, bool approved);
    event RelayerUpdated(address relayer, bool approved);
    event FeeCollectorUpdated(address oldCollector, address newCollector);
    event MinAmountUpdated(address indexed token, uint256 amount);

    // ═══════════════════════════════════════════════════════════════
    //                        CONSTRUCTOR & NATIVE
    // ═══════════════════════════════════════════════════════════════

    constructor(address _feeCollector, address _usdc) Ownable(msg.sender) {
        require(_feeCollector != address(0), "Invalid fee collector");
        require(_usdc != address(0), "Invalid USDC address");

        feeCollector = _feeCollector;
        approvedTokens[_usdc] = true;
        approvedTokens[address(0)] = true; // Support native assets (BNB/ETH)

        // Set Default Minimums
        minTradeAmount[_usdc] = 1e6; // 1 USDC
        minTradeAmount[address(0)] = 1e15; // 0.001 BNB/ETH (~₹50)

        emit TokenApproved(_usdc, true);
        emit TokenApproved(address(0), true);
        emit FeeCollectorUpdated(address(0), _feeCollector);
    }

    /**
     * @notice Mail slot for receiving native assets (BNB/ETH)
     */
    receive() external payable {}

    // ═══════════════════════════════════════════════════════════════
    //                     VAULT FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Deposit funds into the vault (supports both native and ERC20)
     */
    function deposit(address _token, uint256 _amount) external payable nonReentrant {
        require(approvedTokens[_token], "Token not approved");
        
        if (_token == address(0)) {
            require(msg.value > 0, "No value sent");
            balances[msg.sender][address(0)] += msg.value;
            emit Deposit(msg.sender, address(0), msg.value);
        } else {
            require(_amount > 0, "Amount must be > 0");
            IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
            balances[msg.sender][_token] += _amount;
            emit Deposit(msg.sender, _token, _amount);
        }
    }

    /**
     * @notice Withdraw unused funds from the vault
     */
    function withdraw(address _token, uint256 _amount) external nonReentrant {
        require(balances[msg.sender][_token] >= _amount, "Insufficient vault balance");
        balances[msg.sender][_token] -= _amount;
        
        if (_token == address(0)) {
            (bool success, ) = payable(msg.sender).call{value: _amount}("");
            require(success, "Native withdraw failed");
        } else {
            IERC20(_token).safeTransfer(msg.sender, _amount);
        }
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
    ) external nonReentrant returns (uint256 tradeId) {
        require(approvedRelayers[msg.sender] || msg.sender == owner(), "Caller not Relayer");
        require(_amount >= minTradeAmount[_token], "Too small");
        require(balances[_seller][_token] >= _amount, "Insufficient vault balance");
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

    /**
     * @notice Seller creates a trade and deposits directly into escrow
     */
    function createTrade(
        address _buyer,
        address _token,
        uint256 _amount,
        uint256 _duration
    ) external payable nonReentrant returns (uint256 tradeId) {
        require(_buyer != address(0) && _buyer != msg.sender, "Invalid buyer");
        require(approvedTokens[_token], "Token not approved");
        require(_amount >= minTradeAmount[_token], "Amount too small");
        require(activeTradeCount[msg.sender] < maxActiveTradesPerUser, "Too many active trades");

        if (_token == address(0)) {
            require(msg.value >= _amount, "Insufficient BNB sent");
        } else {
            IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        }

        if (_duration == 0) _duration = DEFAULT_ESCROW_DURATION;
        require(_duration <= MAX_ESCROW_DURATION, "Too long");

        uint256 feeAmount = (_amount * feeBps) / 10000;
        uint256 buyerReceives = _amount - feeAmount;

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

        activeTradeCount[msg.sender]++;
        emit TradeCreated(tradeId, msg.sender, _buyer, _token, _amount, feeAmount, block.timestamp + _duration);
    }

    // ═══════════════════════════════════════════════════════════════
    //                     CORE TRADE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Buyer marks that they've sent fiat payment
     */
    function markFiatSent(uint256 _tradeId) external {
        Trade storage trade = trades[_tradeId];
        require(msg.sender == trade.buyer, "Only buyer");
        require(trade.status == TradeStatus.Active, "Not active");
        require(block.timestamp <= trade.deadline, "Expired");

        trade.status = TradeStatus.FiatSent;
        trade.fiatSentAt = block.timestamp;
        emit FiatMarkedSent(_tradeId, msg.sender);
    }

    /**
     * @notice Release asset to buyer after seller confirms payment
     */
    function release(uint256 _tradeId) external nonReentrant {
        Trade storage trade = trades[_tradeId];
        require(msg.sender == trade.seller || approvedRelayers[msg.sender] || msg.sender == owner(), "Not authorized");
        require(trade.status == TradeStatus.Active || trade.status == TradeStatus.FiatSent, "Not releasable");

        trade.status = TradeStatus.Completed;
        activeTradeCount[trade.seller]--;

        if (trade.token == address(0)) {
            (bool s1, ) = payable(trade.buyer).call{value: trade.buyerReceives}("");
            require(s1, "Release to buyer failed");
            if (trade.feeAmount > 0) {
                (bool s2, ) = payable(feeCollector).call{value: trade.feeAmount}("");
                require(s2, "Fee transfer failed");
            }
        } else {
            IERC20(trade.token).safeTransfer(trade.buyer, trade.buyerReceives);
            if (trade.feeAmount > 0) IERC20(trade.token).safeTransfer(feeCollector, trade.feeAmount);
        }

        totalFeesCollected[trade.token] += trade.feeAmount;
        emit TradeReleased(_tradeId, trade.buyer, trade.buyerReceives, trade.feeAmount);
    }

    /**
     * @notice Refund asset back to seller (timeout or cancel)
     */
    function refund(uint256 _tradeId) external nonReentrant {
        Trade storage trade = trades[_tradeId];
        
        bool isTimeout = block.timestamp > trade.deadline && trade.status == TradeStatus.Active;
        bool isSellerCancel = msg.sender == trade.seller && trade.status == TradeStatus.Active;
        bool isRelayer = approvedRelayers[msg.sender] || msg.sender == owner();

        require(isTimeout || isSellerCancel || (isRelayer && trade.status != TradeStatus.Completed), "Not authorized to refund");

        trade.status = isSellerCancel || isTimeout ? TradeStatus.Cancelled : TradeStatus.Refunded;
        activeTradeCount[trade.seller]--;

        if (trade.token == address(0)) {
            (bool success, ) = payable(trade.seller).call{value: trade.amount}("");
            require(success, "Refund failed");
        } else {
            IERC20(trade.token).safeTransfer(trade.seller, trade.amount);
        }

        emit TradeRefunded(_tradeId, trade.seller, trade.amount);
    }

    // ═══════════════════════════════════════════════════════════════
    //                      ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    function setFeeBps(uint256 _newFeeBps) external onlyOwner {
        require(_newFeeBps <= MAX_FEE_BPS, "Too high");
        uint256 old = feeBps;
        feeBps = _newFeeBps;
        emit FeeUpdated(old, _newFeeBps);
    }

    function setApprovedToken(address _token, bool _approved) external onlyOwner {
        approvedTokens[_token] = _approved;
        emit TokenApproved(_token, _approved);
    }

    function setRelayer(address _relayer, bool _approved) external onlyOwner {
        approvedRelayers[_relayer] = _approved;
        emit RelayerUpdated(_relayer, _approved);
    }

    function setMinTradeAmount(address _token, uint256 _amount) external onlyOwner {
        minTradeAmount[_token] = _amount;
        emit MinAmountUpdated(_token, _amount);
    }

    function setFeeCollector(address _newCollector) external onlyOwner {
        require(_newCollector != address(0), "Invalid address");
        address old = feeCollector;
        feeCollector = _newCollector;
        emit FeeCollectorUpdated(old, _newCollector);
    }

    function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
        if (_token == address(0)) {
            (bool success, ) = payable(owner()).call{value: _amount}("");
            require(success, "Withdraw failed");
        } else {
            IERC20(_token).safeTransfer(owner(), _amount);
        }
    }
}
