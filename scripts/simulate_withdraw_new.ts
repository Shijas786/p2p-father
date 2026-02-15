
import { ethers } from "ethers";
import { env } from "../src/config/env";

const USER_ADDRESS = "0x6C31212a23040998E1D1c157ACe3982aBDBE3154";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ESCROW_ADDRESS = "0x78c2B85759C5F7d58fEea82D0Be098E540272245";

async function main() {
    console.log(`Simulating WITHDRAW for ${USER_ADDRESS}...`);
    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);

    const escrowAbi = [
        "function withdraw(address, uint256)"
    ];
    const escrow = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, provider);

    const amount = ethers.parseUnits("1.0", 6);

    try {
        console.log("Estimating Gas for Withdraw...");
        const gasEstimate = await escrow.withdraw.estimateGas(USDC_BASE, amount, { from: USER_ADDRESS });
        console.log(`   Gas Estimate: ${gasEstimate.toString()} units`);

        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || 100000n;
        const cost = gasEstimate * gasPrice;

        console.log(`   Gas Price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
        console.log(`   Estimated Cost: ${ethers.formatEther(cost)} ETH`);

        const usdCost = parseFloat(ethers.formatEther(cost)) * 2600;
        console.log(`   Approximate Cost in USD: $${usdCost.toFixed(5)}`);

    } catch (err: any) {
        console.error("❌ GAS ESTIMATION FAILED:", err.message);
    }
}

main();
