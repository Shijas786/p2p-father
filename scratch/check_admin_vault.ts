import { ethers } from "ethers";
import { env } from "../src/config/env";

async function main() {
    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const adminAddr = "0x3A5668F8B3E167771d503F0321c42a7B082789Ef";
    const escrowAddr = env.ESCROW_CONTRACT_ADDRESS;

    const abi = ["function balances(address user, address token) view returns (uint256)"];
    const escrow = new ethers.Contract(escrowAddr, abi, provider);

    const adminUsdcVault = await escrow.balances(adminAddr, env.USDC_ADDRESS);
    const adminUsdtVault = await escrow.balances(adminAddr, env.USDT_ADDRESS);

    console.log("Admin Wallet Vault Balances on Base:");
    console.log(`  USDC: ${ethers.formatUnits(adminUsdcVault, 6)}`);
    console.log(`  USDT: ${ethers.formatUnits(adminUsdtVault, 6)}`);
}

main().catch(console.error);
