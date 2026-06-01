import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = process.env.BSC_RPC_URL;
const ESCROW_BSC = "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";
const BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)"
];

async function check() {
    const bscProvider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    
    const usdc = new ethers.Contract(BSC_USDC, ERC20_ABI, bscProvider);
    const usdt = new ethers.Contract(BSC_USDT, ERC20_ABI, bscProvider);
    
    const bBnb = await bscProvider.getBalance(ESCROW_BSC);
    const bUsdc = await usdc.balanceOf(ESCROW_BSC);
    const bUsdt = await usdt.balanceOf(ESCROW_BSC);
    
    console.log("Raw Contract Holdings:");
    console.log("BNB:", ethers.formatEther(bBnb));
    console.log("USDC:", ethers.formatEther(bUsdc));
    console.log("USDT:", ethers.formatEther(bUsdt));
}

check().catch(console.error);
