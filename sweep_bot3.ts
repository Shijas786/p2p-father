import { ethers } from "ethers";
import { config } from "dotenv";
import { wallet as walletService } from "./src/services/wallet";
config();

async function sweep() {
    const BSC_RPC = "https://bsc-dataseed.binance.org";
    const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
    const DESTINATION = "0x3A5668F8B3E167771d503F0321c42a7B082789Ef"; // Relayer wallet
    const userIndex = 0;

    const derived = walletService.deriveWallet(userIndex);
    const provider = new ethers.JsonRpcProvider(BSC_RPC);
    const wallet = new ethers.Wallet(derived.privateKey, provider);
    
    const abi = ["function balanceOf(address) view returns (uint256)", "function transfer(address, uint256) returns (bool)"];
    const usdt = new ethers.Contract(USDT_ADDRESS, abi, wallet);
    
    const balance = await usdt.balanceOf(wallet.address);
    console.log(`Bot Wallet (${wallet.address}) BSC USDT Balance: ${ethers.formatUnits(balance, 18)}`);
    
    if (balance > 0n) {
        console.log(`Sweeping to ${DESTINATION}...`);
        try {
            const tx = await usdt.transfer(DESTINATION, balance);
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
