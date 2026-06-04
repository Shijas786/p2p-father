import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
const CTF_ADDRESS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
const conditionId = "0x67405fbc8945726be558126fcd7b8a5eae83bea9f8f4f71582e3ec2ffafad384";

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const ctf = new ethers.Contract(CTF_ADDRESS, [
        "function payoutDenominator(bytes32) view returns (uint256)",
        "function payoutNumerators(bytes32, uint256) view returns (uint256)"
    ], provider);

    const denom = await ctf.payoutDenominator(conditionId);
    console.log(`Payout Denominator: ${denom.toString()}`);

    if (denom > 0n) {
        const num0 = await ctf.payoutNumerators(conditionId, 0);
        const num1 = await ctf.payoutNumerators(conditionId, 1);
        console.log(`Payout Numerator for Index 0 (Up):   ${num0.toString()}`);
        console.log(`Payout Numerator for Index 1 (Down): ${num1.toString()}`);
    } else {
        console.log(`Market is NOT resolved on-chain yet.`);
    }
}

main().catch(console.error);
