
import { ethers } from "ethers";
import { env } from "../src/config/env";

const USER_ADDRESS = "0x6C31212a23040998E1D1c157ACe3982aBDBE3154";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ESCROW_ADDRESS = "0x78c2B85759C5F7d58fEea82D0Be098E540272245";

async function main() {
    console.log(`Checking balance for ${USER_ADDRESS} on Base...`);
    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);

    // 1. Vault Balance
    const escrowAbi = ["function balances(address, address) view returns (uint256)"];
    const escrow = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, provider);
    const vaultBal = await escrow.balances(USER_ADDRESS, USDC_BASE);
    console.log(`Vault USDC Balance:  ${ethers.formatUnits(vaultBal, 6)} USDC`);

    // 2. Wallet Balance
    const usdcAbi = ["function balanceOf(address) view returns (uint256)"];
    const usdc = new ethers.Contract(USDC_BASE, usdcAbi, provider);
    const wallBal = await usdc.balanceOf(USER_ADDRESS);
    console.log(`Wallet USDC Balance: ${ethers.formatUnits(wallBal, 6)} USDC`);

    // 3. ETH Balance
    const ethBal = await provider.getBalance(USER_ADDRESS);
    console.log(`ETH Balance:        ${ethers.formatEther(ethBal)} ETH`);
}

main();
