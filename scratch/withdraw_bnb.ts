import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = process.env.BSC_RPC_URL;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
const ESCROW_BSC = "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";

const ESCROW_ABI = [
    "function emergencyWithdraw(address _token, uint256 _amount)",
    "function withdrawFees(address _token)",
    "function owner() view returns (address)"
];

async function run() {
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const adminSigner = new ethers.Wallet(RELAYER_PRIVATE_KEY!, provider);
    const escrow = new ethers.Contract(ESCROW_BSC, ESCROW_ABI, adminSigner);
    
    const bal = await provider.getBalance(ESCROW_BSC);
    console.log("Contract BNB Balance:", ethers.formatEther(bal));
    
    const owner = await escrow.owner();
    console.log("Contract Owner:", owner);
    console.log("Admin Wallet:", adminSigner.address);
    
    if (bal > 0n) {
        try {
            console.log("Attempting to withdrawFees(BNB)...");
            const tx = await escrow.withdrawFees(ethers.ZeroAddress, { gasLimit: 100000 });
            await tx.wait();
            console.log("✅ Withdrew fees.");
        } catch(e) {
            console.log("withdrawFees failed, trying emergencyWithdraw...");
            try {
                const tx = await escrow.emergencyWithdraw(ethers.ZeroAddress, bal, { gasLimit: 100000 });
                await tx.wait();
                console.log("✅ emergencyWithdraw BNB successful.");
            } catch(e2:any) {
                console.log("❌ emergencyWithdraw failed:", e2.shortMessage || e2.message);
            }
        }
    }
}

run().catch(console.error);
