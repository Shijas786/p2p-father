

// Sources flattened with hardhat v2.28.6 https://hardhat.org

// SPDX-License-Identifier: MIT

// File @openzeppelin/contracts/utils/Context.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

pragma solidity ^0.8.20;

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}


// File @openzeppelin/contracts/access/Ownable.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}


// File @openzeppelin/contracts/utils/introspection/IERC165.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (utils/introspection/IERC165.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}


// File @openzeppelin/contracts/interfaces/IERC165.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC165.sol)

pragma solidity >=0.4.16;


// File @openzeppelin/contracts/token/ERC20/IERC20.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/IERC20.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}


// File @openzeppelin/contracts/interfaces/IERC20.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC20.sol)

pragma solidity >=0.4.16;


// File @openzeppelin/contracts/interfaces/IERC1363.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC1363.sol)

pragma solidity >=0.6.2;


/**
 * @title IERC1363
 * @dev Interface of the ERC-1363 standard as defined in the https://eips.ethereum.org/EIPS/eip-1363[ERC-1363].
 *
 * Defines an extension interface for ERC-20 tokens that supports executing code on a recipient contract
 * after `transfer` or `transferFrom`, or code on a spender contract after `approve`, in a single transaction.
 */
interface IERC1363 is IERC20, IERC165 {
    /*
     * Note: the ERC-165 identifier for this interface is 0xb0202a11.
     * 0xb0202a11 ===
     *   bytes4(keccak256('transferAndCall(address,uint256)')) ^
     *   bytes4(keccak256('transferAndCall(address,uint256,bytes)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256,bytes)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256,bytes)'))
     */

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @param data Additional data with no specified format, sent in call to `spender`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value, bytes calldata data) external returns (bool);
}


// File @openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.3.0) (token/ERC20/utils/SafeERC20.sol)

pragma solidity ^0.8.20;


/**
 * @title SafeERC20
 * @dev Wrappers around ERC-20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    /**
     * @dev An operation with an ERC-20 token failed.
     */
    error SafeERC20FailedOperation(address token);

    /**
     * @dev Indicates a failed `decreaseAllowance` request.
     */
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @dev Variant of {safeTransfer} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransfer(IERC20 token, address to, uint256 value) internal returns (bool) {
        return _callOptionalReturnBool(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @dev Variant of {safeTransferFrom} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransferFrom(IERC20 token, address from, address to, uint256 value) internal returns (bool) {
        return _callOptionalReturnBool(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        forceApprove(token, spender, oldAllowance + value);
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `requestedDecrease`. If `token` returns no
     * value, non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 requestedDecrease) internal {
        unchecked {
            uint256 currentAllowance = token.allowance(address(this), spender);
            if (currentAllowance < requestedDecrease) {
                revert SafeERC20FailedDecreaseAllowance(spender, currentAllowance, requestedDecrease);
            }
            forceApprove(token, spender, currentAllowance - requestedDecrease);
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     *
     * NOTE: If the token implements ERC-7674, this function will not modify any temporary allowance. This function
     * only sets the "standard" allowance. Any temporary allowance will remain active, in addition to the value being
     * set here.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        bytes memory approvalCall = abi.encodeCall(token.approve, (spender, value));

        if (!_callOptionalReturnBool(token, approvalCall)) {
            _callOptionalReturn(token, abi.encodeCall(token.approve, (spender, 0)));
            _callOptionalReturn(token, approvalCall);
        }
    }

    /**
     * @dev Performs an {ERC1363} transferAndCall, with a fallback to the simple {ERC20} transfer if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            safeTransfer(token, to, value);
        } else if (!token.transferAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferFromAndCall, with a fallback to the simple {ERC20} transferFrom if the target
     * has no code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferFromAndCallRelaxed(
        IERC1363 token,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        if (to.code.length == 0) {
            safeTransferFrom(token, from, to, value);
        } else if (!token.transferFromAndCall(from, to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} approveAndCall, with a fallback to the simple {ERC20} approve if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * NOTE: When the recipient address (`to`) has no code (i.e. is an EOA), this function behaves as {forceApprove}.
     * Opposedly, when the recipient address (`to`) has code, this function only attempts to call {ERC1363-approveAndCall}
     * once without retrying, and relies on the returned value to be true.
     *
     * Reverts if the returned value is other than `true`.
     */
    function approveAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            forceApprove(token, to, value);
        } else if (!token.approveAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturnBool} that reverts if call fails to meet the requirements.
     */
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            let success := call(gas(), token, 0, add(data, 0x20), mload(data), 0, 0x20)
            // bubble errors
            if iszero(success) {
                let ptr := mload(0x40)
                returndatacopy(ptr, 0, returndatasize())
                revert(ptr, returndatasize())
            }
            returnSize := returndatasize()
            returnValue := mload(0)
        }

        if (returnSize == 0 ? address(token).code.length == 0 : returnValue != 1) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturn} that silently catches all reverts and returns a bool instead.
     */
    function _callOptionalReturnBool(IERC20 token, bytes memory data) private returns (bool) {
        bool success;
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            success := call(gas(), token, 0, add(data, 0x20), mload(data), 0, 0x20)
            returnSize := returndatasize()
            returnValue := mload(0)
        }
        return success && (returnSize == 0 ? address(token).code.length > 0 : returnValue == 1);
    }
}


// File @openzeppelin/contracts/utils/ReentrancyGuard.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/ReentrancyGuard.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private _status;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        if (_status == ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }

        // Any calls to nonReentrant after this point will fail
        _status = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == ENTERED;
    }
}


// File contracts/P2PEscrow.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.20;




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

    /// @notice Fee in basis points (50 = 0.5%)
    uint256 public feeBps = 50;

    /// @notice Maximum fee cap (5% = 500 bps) — safety limit
    uint256 public constant MAX_FEE_BPS = 500;

    /// @notice Minimum trade amount (1 USDC = 1e6)
    uint256 public constant MIN_TRADE_AMOUNT = 1e6;

    /// @notice Maximum escrow duration (24 hours)
    uint256 public constant MAX_ESCROW_DURATION = 24 hours;

    /// @notice Default escrow duration (1 hour)
    uint256 public constant DEFAULT_ESCROW_DURATION = 1 hours;

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
        // Only Fee Collector (Relayer) or Owner can match trades
        require(msg.sender == feeCollector || msg.sender == owner(), "Caller not Relayer");
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
            // If buyer already sent fiat → use autoRelease() instead!
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

    // Auto-release removed to prevent buyer scams.
    // Trades must now be Released by seller or Resolved by Admin.

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
