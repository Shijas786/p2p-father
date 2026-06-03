import { ethers } from "ethers";
import { config } from "dotenv";
config();

async function check() {
    const POLYGON_RPC = "https://rpc.ankr.com/polygon";
    const USDCE_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    const TARGET = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";
    
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const abi = ["function balanceOf(address) view returns (uint256)"];
    const usdc = new ethers.Contract(USDCE_ADDRESS, abi, provider);
    
    const bal = await usdc.balanceOf(TARGET);
    console.log(`USDC.e Balance on Polygon: ${ethers.formatUnits(bal, 6)}`);
}
check();
