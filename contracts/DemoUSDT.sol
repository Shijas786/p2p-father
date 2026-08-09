// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title DemoUSDT
 * @notice Custom USDT Demo token for BSC Testnet testing.
 * Allows users and relayer to mint test USDT instantly.
 */
contract DemoUSDT is ERC20 {
    constructor() ERC20("Tether USD", "USDT") {
        // Mint initial 1,000,000,000 USDT to deployer for liquidity supply
        _mint(msg.sender, 1_000_000_000 * 10**decimals());
    }

    /**
     * @notice Mint testnet USDT to a specified address
     * @param to Recipient wallet address
     * @param amount Token amount in wei (18 decimals)
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /**
     * @notice Public faucet method dispensing 1,000 USDT to caller
     */
    function faucet() external {
        _mint(msg.sender, 1_000 * 10**decimals());
    }

    /**
     * @notice Decimals match standard ERC-20 on BSC (18 decimals)
     */
    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
