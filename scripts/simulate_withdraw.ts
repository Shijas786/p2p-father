
import { ethers } from "ethers";
import { env } from "../src/config/env";

const USER_ADDRESS = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ESCROW_ADDRESS = "0x78c2B85759C5F7d58fEea82D0Be098E540272245";

async function main() {
    console.log(`Simulating WITHDRAW for ${USER_ADDRESS}...`);
    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);

    const escrowAbi = [
        "function balances(address, address) view returns (uint256)",
        "function withdraw(address, uint256)"
    ];
    const escrow = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, provider);

    // 1. Check current balance first
    const bal = await escrow.balances(USER_ADDRESS, USDC_BASE);
    console.log(`Current Vault Balance: ${ethers.formatUnits(bal, 6)} USDC`);

    const amount = ethers.parseUnits("0.1", 6); // Try to withdraw 0.1 USDC

    try {
        console.log(`Attempting to simulate withdraw of 0.1 USDC...`);
        // Use staticCall to see real revert reason
        await escrow.withdraw.staticCall(USDC_BASE, amount, { from: USER_ADDRESS });
        console.log("✅ Static Call Successful!");

        const gasEstimate = await escrow.withdraw.estimateGas(USDC_BASE, amount, { from: USER_ADDRESS });
        console.log(`   Gas Estimate: ${gasEstimate.toString()} units`);

    } catch (err: any) {
        console.error("❌ WITHDRAW SIMULATION FAILED:");
        if (err.reason) console.error("   Reason:", err.reason);
        else console.error("   Error Message:", err.message);
    }
}

main();
