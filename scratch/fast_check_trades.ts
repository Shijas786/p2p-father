import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = process.env.BSC_RPC_URL;
const ESCROW_BSC = "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";

// Using a slightly more generic ABI for trades:
const ESCROW_ABI = [
    "function trades(uint256) view returns (uint256, address, address, address, uint256, uint256, uint256, uint8)"
];

async function check() {
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const escrow = new ethers.Contract(ESCROW_BSC, ESCROW_ABI, provider);
    
    let sum = 0n;
    for (let i = 551; i <= 554; i++) {
        try {
            const t = await escrow.trades(i);
            const status = t[7];
            const amount = t[4];
            console.log(`Trade ${i}: Amount = ${ethers.formatEther(amount)}, Status = ${status}, Seller = ${t[1]}`);
            if (status === 0n || status === 1n || status === 2n) sum += amount;
        } catch(e) { }
    }
    console.log("Total locked in trades 551-554:", ethers.formatEther(sum));
}

check().catch(console.error);
