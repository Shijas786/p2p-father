import { ethers } from "ethers";
async function check() {
    const BSC_RPC = "https://bsc-dataseed.binance.org";
    const USDT = "0x55d398326f99059fF775485246999027B3197955";
    const TARGET = "0x0837c2C6ec57c197E9fCBECBf00F2202aA914704";
    
    const provider = new ethers.JsonRpcProvider(BSC_RPC);
    const abi = ["function balanceOf(address) view returns (uint256)"];
    const usdc = new ethers.Contract(USDT, abi, provider);
    
    const bal = await usdc.balanceOf(TARGET);
    console.log(`USDT Balance of Bridge Address on BSC: ${ethers.formatUnits(bal, 18)}`);
}
check();
