
import { ethers } from "ethers";
import { env } from "../src/config/env";

const USER_ADDRESS = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ESCROW_ADDRESS = "0x78c2B85759C5F7d58fEea82D0Be098E540272245";

async function main() {
    console.log(`Simulating APPROVE for ${USER_ADDRESS}...`);
    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);

    // ERC20 Approve
    const usdcAbi = ["function approve(address, uint256) returns (bool)"];
    const usdc = new ethers.Contract(USDC_BASE, usdcAbi, provider);

    const amount = ethers.parseUnits("1.0", 6);

    try {
        console.log("Estimating Gas for Approve...");
        const gasEstimate = await usdc.approve.estimateGas(ESCROW_ADDRESS, amount, { from: USER_ADDRESS });
        console.log(`   Gas Estimate: ${gasEstimate.toString()} units`);

        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || 100000n; // fallback
        const cost = gasEstimate * gasPrice;

        console.log(`   Gas Price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
        console.log(`   Estimated Cost: ${ethers.formatEther(cost)} ETH`);

        // Convert to USD (approx $2600 ETH)
        const usdCost = parseFloat(ethers.formatEther(cost)) * 2600;
        console.log(`   Approximate Cost in USD: $${usdCost.toFixed(5)}`);

    } catch (err: any) {
        console.error("❌ GAS ESTIMATION FAILED:", err.message);
    }
}

main();
