import { ethers } from "ethers";
import "dotenv/config";

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
    const ctfAddress = ethers.getAddress("0x4d97dcd97ec945f40cf65f87097ace5ea0476045");
    const ctfContract = new ethers.Contract(ctfAddress, [
        "function payoutDenominator(bytes32) view returns (uint256)",
        "function payoutNumerators(bytes32, uint256) view returns (uint256)"
    ], provider);
    
    const conditionId = "0x0650856a6c5db2495e2ca3cc86ac40977cdbea0c1d4ed6c98b0f961a14940994";
    
    const denominator = await ctfContract.payoutDenominator(conditionId);
    console.log(`Denominator: ${denominator.toString()}`);
    
    if (denominator > 0n) {
        const num0 = await ctfContract.payoutNumerators(conditionId, 0);
        const num1 = await ctfContract.payoutNumerators(conditionId, 1);
        console.log(`Outcome 0 (UP) Payout: ${num0.toString()}`);
        console.log(`Outcome 1 (DOWN) Payout: ${num1.toString()}`);
        console.log(`Winner: ${num0 > 0n ? "UP 🟢" : "DOWN 🔴"}`);
    } else {
        console.log("Market not resolved yet.");
    }
}

main().catch(console.error);
