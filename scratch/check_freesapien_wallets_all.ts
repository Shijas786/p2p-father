import { ethers } from "ethers";
import { env } from "../src/config/env";

async function main() {
    const vaultWallet = "0x6540Bb882aE5b710C5a0efd9F76dada30ac7F9cF";
    const depositWallet = "0x381d688629446B118ba4860dB9e8540aa34E318A";

    const baseProvider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const bscProvider = new ethers.JsonRpcProvider(env.BSC_RPC_URL);

    const erc20Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)"
    ];

    console.log("=== Checking Vault Wallet:", vaultWallet, "===");
    console.log("ETH Balance (Base):", ethers.formatEther(await baseProvider.getBalance(vaultWallet)));
    console.log("BNB Balance (BSC):", ethers.formatEther(await bscProvider.getBalance(vaultWallet)));

    const baseUsdcContract = new ethers.Contract(env.USDC_ADDRESS, erc20Abi, baseProvider);
    const baseUsdtContract = new ethers.Contract(env.USDT_ADDRESS, erc20Abi, baseProvider);
    const bscUsdtContract = new ethers.Contract("0x55d398326f99059fF775485246999027B3197955", erc20Abi, bscProvider);

    console.log("Base USDC Direct Bal:", ethers.formatUnits(await baseUsdcContract.balanceOf(vaultWallet), 6));
    console.log("Base USDT Direct Bal:", ethers.formatUnits(await baseUsdtContract.balanceOf(vaultWallet), 6));
    console.log("BSC USDT Direct Bal:", ethers.formatUnits(await bscUsdtContract.balanceOf(vaultWallet), 18));

    console.log("\n=== Checking Deposit/Polymarket Wallet:", depositWallet, "===");
    console.log("ETH Balance (Base):", ethers.formatEther(await baseProvider.getBalance(depositWallet)));
    console.log("BNB Balance (BSC):", ethers.formatEther(await bscProvider.getBalance(depositWallet)));
    console.log("Base USDC Direct Bal:", ethers.formatUnits(await baseUsdcContract.balanceOf(depositWallet), 6));
    console.log("Base USDT Direct Bal:", ethers.formatUnits(await baseUsdtContract.balanceOf(depositWallet), 6));
    console.log("BSC USDT Direct Bal:", ethers.formatUnits(await bscUsdtContract.balanceOf(depositWallet), 18));

    // Check if user has proxy wallet on Polymarket or Base
    const escrowAbi = ["function balances(address user, address token) view returns (uint256)"];
    const baseEscrow = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, escrowAbi, baseProvider);
    const depositUsdcVault = await baseEscrow.balances(depositWallet, env.USDC_ADDRESS);
    const depositUsdtVault = await baseEscrow.balances(depositWallet, env.USDT_ADDRESS);
    console.log("\nDeposit Wallet Vault USDC (Base):", ethers.formatUnits(depositUsdcVault, 6));
    console.log("Deposit Wallet Vault USDT (Base):", ethers.formatUnits(depositUsdtVault, 6));
}

main().catch(console.error);
