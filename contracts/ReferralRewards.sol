// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ReferralRewards is Initializable, UUPSUpgradeable, OwnableUpgradeable, PausableUpgradeable, EIP712Upgradeable {
    using SafeERC20 for IERC20;

    // Events
    event RewardsClaimed(address indexed user, uint256 invitesClaimed, uint256 rewardAmount);
    event RewardsQueued(address indexed user, uint256 invitesQueued, uint256 rewardAmount);
    event TrustedSignerUpdated(address oldSigner, address newSigner);
    event RewardTokenUpdated(address oldToken, address newToken);
    event EmergencyWithdraw(address token, address to, uint256 amount);

    // Constants
    bytes32 private constant CLAIM_TYPEHASH = keccak256("ClaimReward(address user,uint256 totalQualifiedInvites)");
    uint256 public constant REWARD_PER_INVITE = 30000; // 0.03 USDC (6 decimals)
    uint256 public constant CLAIM_THRESHOLD = 5;

    // State Variables
    IERC20 public usdcToken;
    address public trustedSigner;
    mapping(address => uint256) public claimedInvites;
    mapping(address => uint256) public pendingInvitesToClaim;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _usdcToken, address _trustedSigner) public initializer {
        __Ownable_init(msg.sender);
        __Pausable_init();
        __EIP712_init("P2PFatherReferrals", "1");

        usdcToken = IERC20(_usdcToken);
        trustedSigner = _trustedSigner;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @dev Claim rewards for qualified referrals.
     * @param totalQualifiedInvites The total number of qualified invites the user has generated.
     * @param signature The EIP-712 signature from the trusted signer confirming the `totalQualifiedInvites`.
     */
    function claimRewards(uint256 totalQualifiedInvites, bytes calldata signature) external whenNotPaused {
        require(totalQualifiedInvites > claimedInvites[msg.sender], "No new invites to claim");

        // Verify Signature
        bytes32 structHash = keccak256(abi.encode(CLAIM_TYPEHASH, msg.sender, totalQualifiedInvites));
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);
        require(signer == trustedSigner, "Invalid signature");

        // Calculate available rewards
        uint256 unclaimedInvites = totalQualifiedInvites - claimedInvites[msg.sender];
        require(unclaimedInvites >= CLAIM_THRESHOLD, "Not enough invites to claim");

        // Only allow claiming in multiples of CLAIM_THRESHOLD (5)
        uint256 invitesToClaim = (unclaimedInvites / CLAIM_THRESHOLD) * CLAIM_THRESHOLD;
        require(invitesToClaim > 0, "No complete sets to claim");

        uint256 rewardAmount = invitesToClaim * REWARD_PER_INVITE;
        
        // Update state before external call
        claimedInvites[msg.sender] += invitesToClaim;

        if (usdcToken.balanceOf(address(this)) >= rewardAmount) {
            // Transfer rewards immediately
            usdcToken.safeTransfer(msg.sender, rewardAmount);
            emit RewardsClaimed(msg.sender, invitesToClaim, rewardAmount);
        } else {
            // Queue rewards for later
            pendingInvitesToClaim[msg.sender] += invitesToClaim;
            emit RewardsQueued(msg.sender, invitesToClaim, rewardAmount);
        }
    }

    /**
     * @dev Claim queued rewards once the contract is funded. Can be called by anyone for a user.
     */
    function claimPendingRewardsFor(address user) external whenNotPaused {
        uint256 invites = pendingInvitesToClaim[user];
        require(invites > 0, "No pending rewards");
        
        uint256 rewardAmount = invites * REWARD_PER_INVITE;
        require(usdcToken.balanceOf(address(this)) >= rewardAmount, "Insufficient contract balance");

        pendingInvitesToClaim[user] = 0;
        usdcToken.safeTransfer(user, rewardAmount);
        
        emit RewardsClaimed(user, invites, rewardAmount);
    }

    /**
     * @dev User claims their own pending rewards.
     */
    function claimPendingRewards() external whenNotPaused {
        // Delegate to internal logic via external call format or just replicate
        uint256 invites = pendingInvitesToClaim[msg.sender];
        require(invites > 0, "No pending rewards");
        
        uint256 rewardAmount = invites * REWARD_PER_INVITE;
        require(usdcToken.balanceOf(address(this)) >= rewardAmount, "Insufficient contract balance");

        pendingInvitesToClaim[msg.sender] = 0;
        usdcToken.safeTransfer(msg.sender, rewardAmount);
        
        emit RewardsClaimed(msg.sender, invites, rewardAmount);
    }

    // Admin Functions

    function setTrustedSigner(address _newSigner) external onlyOwner {
        require(_newSigner != address(0), "Zero address");
        emit TrustedSignerUpdated(trustedSigner, _newSigner);
        trustedSigner = _newSigner;
    }

    function setRewardToken(address _newToken) external onlyOwner {
        require(_newToken != address(0), "Zero address");
        emit RewardTokenUpdated(address(usdcToken), _newToken);
        usdcToken = IERC20(_newToken);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Withdraw stuck tokens (or empty the contract).
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amount);
        emit EmergencyWithdraw(token, msg.sender, amount);
    }

    /**
     * @dev Helper to get the un-withdrawn balance of the contract.
     */
    function contractBalance() external view returns (uint256) {
        return usdcToken.balanceOf(address(this));
    }
}
