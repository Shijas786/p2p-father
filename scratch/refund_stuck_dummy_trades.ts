import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = process.env.BSC_RPC_URL;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
const ESCROW_BSC = "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";

const ESCROW_ABI = [
    "function refund(uint256 _tradeId)",
    "function trades(uint256) view returns (uint256 id, address seller, address buyer, address token, uint256 amount, uint256 feeAmount, uint256 deadline, uint8 status)"
];

async function execute() {
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const adminSigner = new ethers.Wallet(RELAYER_PRIVATE_KEY!, provider);
    const escrow = new ethers.Contract(ESCROW_BSC, ESCROW_ABI, adminSigner);

    // Let's check trades 550 to 560
    for (let i = 550; i <= 560; i++) {
        try {
            const t = await escrow.trades(i);
            // status 0 is Active, status 1 is FiatSent, status 2 is Disputed
            if (t.status === 0n || t.status === 1n || t.status === 2n) {
                console.log(`Found active dummy trade ${i} for ${ethers.formatEther(t.amount)} token. Refunding...`);
                const tx = await escrow.refund(i, { gasLimit: 300000 });
                await tx.wait();
                console.log(`✅ Refunded trade ${i}`);
            }
        } catch(e:any) {
            // Ignore errors for non-existent trades
        }
    }
}

execute().catch(console.error);
