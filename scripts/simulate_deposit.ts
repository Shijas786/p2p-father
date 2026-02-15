
import { ethers } from "ethers";
import { env } from "../src/config/env";

const USER_ADDRESS = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ESCROW_ADDRESS = "0x78c2B85759C5F7d58fEea82D0Be098E540272245";

async function main() {
    console.log(`Simulating deposit for ${USER_ADDRESS}...`);
    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);

    // 1. Simulate using 'call' (static call) to check for logic Reverts
    console.log("1. Static Call (Check Reverts)...");
    const escrowAbi = ["function deposit(address, uint256)"];
    const escrow = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, provider);

    // Attempting to deposit 0.5 USDC (User has 1.0)
    const amount = ethers.parseUnits("0.5", 6);

    try {
        await escrow.deposit.staticCall(USDC_BASE, amount, { from: USER_ADDRESS });
        console.log("✅ Static Call Successful: No Revert detected.");
    } catch (err: any) {
        console.error("❌ STATIC CALL FAILED (REVERT):");
        if (err.reason) console.error("   Reason:", err.reason);
        if (err.data) console.error("   Data:", err.data);
        else console.error("   Error:", err.message);
        return; // Stop if static call fails
    }

    // 2. Estimate Gas
    console.log("\n2. Estimating Gas...");
    try {
        const gasEstimate = await escrow.deposit.estimateGas(USDC_BASE, amount, { from: USER_ADDRESS });
        console.log(`   Gas Estimate: ${gasEstimate.toString()} units`);

        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || 100000n; // fallback
        const cost = gasEstimate * gasPrice;

        console.log(`   Gas Price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
        console.log(`   Estimated Cost: ${ethers.formatEther(cost)} ETH`);
    } catch (err: any) {
        console.error("❌ GAS ESTIMATION FAILED:");
        console.error("   Error:", err.message);
    }
}

main();
