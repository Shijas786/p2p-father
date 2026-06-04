import { ethers } from "ethers";

async function check() {
    const provider = new ethers.JsonRpcProvider("https://polygon.llamarpc.com");
    const ctf = new ethers.Contract("0x4D97DCd97eC945f40cF65F87097ACe5EA0476045", [
        "function balanceOf(address, uint256) view returns (uint256)"
    ], provider);
    const proxy = "0xf20872C359788a53958a048413D64F183403B1f1";
    // Active BTC market from logs: 
    // YES token? We need the token IDs. Let's just check the USDC balance.
    const usdc = new ethers.Contract("0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", [
        "function balanceOf(address) view returns (uint256)"
    ], provider);
    const pusd = new ethers.Contract("0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB", [
        "function balanceOf(address) view returns (uint256)"
    ], provider);

    const b1 = await usdc.balanceOf(proxy);
    const b2 = await pusd.balanceOf(proxy);
    console.log("USDC.e:", b1.toString());
    console.log("pUSD:", b2.toString());
}
check();
