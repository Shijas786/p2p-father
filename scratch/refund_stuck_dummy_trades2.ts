import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = process.env.BSC_RPC_URL;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
const ESCROW_BSC = "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";

const ESCROW_ABI = ["function refund(uint256 _tradeId)"];

async function execute() {
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const adminSigner = new ethers.Wallet(RELAYER_PRIVATE_KEY!, provider);
    const escrow = new ethers.Contract(ESCROW_BSC, ESCROW_ABI, adminSigner);

    // Blindly refund the 4 trades created by the broken script
    for (let i = 551; i <= 554; i++) {
        try {
            console.log(`Refunding trade ${i}...`);
            const tx = await escrow.refund(i, { gasLimit: 300000 });
            await tx.wait();
            console.log(`✅ Refunded trade ${i}`);
        } catch(e:any) {
            console.log(`Failed to refund ${i}:`, e.shortMessage || e.message);
        }
    }
}

execute().catch(console.error);
