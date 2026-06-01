import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = process.env.BSC_RPC_URL;
const ESCROW_BSC = "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";

// Note: If totalVaultBalances is missing, this is the really old contract. 
// It might just have balances mapped.
const ESCROW_ABI = [
    "function balances(address user, address token) view returns (uint256)",
    "function owner() view returns (address)"
];

async function check() {
    const bscProvider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const contractBsc = new ethers.Contract(ESCROW_BSC, ESCROW_ABI, bscProvider);
    
    try {
        const owner = await contractBsc.owner();
        console.log("Contract Owner:", owner);
    } catch(e: any) {
        console.log("Could not fetch owner:", e.message);
    }
}

check().catch(console.error);
