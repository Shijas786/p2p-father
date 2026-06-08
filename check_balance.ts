import { ethers } from "ethers";

async function main() {
    const provider = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org");
    const tokenContract = new ethers.Contract("0x55d398326f99059fF775485246999027B3197955", [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)"
    ], provider);
    
    const address = "0x774Ef3cf5dC7522D833D59Bf0a4FF9024417cA70";
    const balance = await tokenContract.balanceOf(address);
    const bnbBalance = await provider.getBalance(address);
    console.log(`USDT Balance for ${address}:`, ethers.formatUnits(balance, 18));
    console.log(`BNB Balance for ${address}:`, ethers.formatUnits(bnbBalance, 18));
    
    process.exit(0);
}
main();
