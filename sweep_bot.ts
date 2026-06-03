import { ethers } from "ethers";
import { config } from "dotenv";
import { walletService } from "./src/services/wallet";
config();

async function sweep() {
    const BSC_RPC = "https://bsc-dataseed.binance.org";
    const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
    
    const userIndex = parseInt(process.argv[2]);
    const DESTINATION_ADDRESS = process.argv[3];
    
    if (isNaN(userIndex) || !DESTINATION_ADDRESS) {
        console.error("Usage: npx tsx sweep_bot.ts <user_wallet_index> <destination_address>");
        process.exit(1);
    }

    const derived = walletService.deriveWallet(userIndex);
    const provider = new ethers.JsonRpcProvider(BSC_RPC);
    const wallet = new ethers.Wallet(derived.privateKey, provider);
    
    const abi = ["function balanceOf(address) view returns (uint256)", "function transfer(address, uint256) returns (bool)"];
    const usdt = new ethers.Contract(USDT_ADDRESS, abi, wallet);
    
    const balance = await usdt.balanceOf(wallet.address);
    console.log(`Bot Wallet (${wallet.address}) BSC USDT Balance: ${ethers.formatUnits(balance, 18)}`);
    
    if (balance > 0n) {
        console.log(`Sweeping to ${DESTINATION_ADDRESS}...`);
        // Needs a tiny bit of BNB for gas, assuming it has it or we can just try
        try {
            const tx = await usdt.transfer(DESTINATION_ADDRESS, balance);
            console.log(`Tx sent: ${tx.hash}`);
            await tx.wait();
            console.log(`Swept successfully!`);
        } catch (e: any) {
            console.error("Failed to send TX, might need BNB for gas on the bot wallet:", e.message);
        }
    } else {
        console.log("No USDT to sweep.");
    }
}
sweep();
