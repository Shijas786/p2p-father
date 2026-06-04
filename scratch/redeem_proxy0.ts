import { polymarketRelayerService } from "../src/services/relayer";
import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const conditionId = "0x67405fbc8945726be558126fcd7b8a5eae83bea9f8f4f71582e3ec2ffafad384";
const indexSet = 2; // IndexSet 2 is Down/No

async function main() {
    console.log(`Attempting to redeem winning shares for User Index 0 (Proxy: 0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02)...`);
    try {
        const txHash = await polymarketRelayerService.redeemPositions(0, conditionId, indexSet);
        console.log(`Redemption process finished! Tx Hash or status: ${txHash}`);
    } catch (err: any) {
        console.error("Redemption failed:", err.message);
    }
}

main().catch(console.error);
