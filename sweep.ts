import { ethers } from "ethers";
import { config } from "dotenv";
config();

async function sweep() {
    const BSC_RPC = "https://bsc-dataseed.binance.org";
    const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
    
    // Replace with the user's deposit address or their own wallet address
    const DESTINATION_ADDRESS = process.argv[2]; 
    if (!DESTINATION_ADDRESS) {
        console.error("Please provide destination address as first argument");
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(BSC_RPC);
    const wallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY!, provider);
    
    const abi = ["function balanceOf(address) view returns (uint256)", "function transfer(address, uint256) returns (bool)"];
    const usdt = new ethers.Contract(USDT_ADDRESS, abi, wallet);
    
    const balance = await usdt.balanceOf(wallet.address);
    console.log(`Relayer BSC USDT Balance: ${ethers.formatUnits(balance, 18)}`);
    
    if (balance > 0n) {
        console.log(`Sweeping to ${DESTINATION_ADDRESS}...`);
        const tx = await usdt.transfer(DESTINATION_ADDRESS, balance);
        console.log(`Tx sent: ${tx.hash}`);
        await tx.wait();
        console.log(`Swept successfully!`);
    } else {
        console.log("No USDT to sweep.");
    }
}
sweep();
