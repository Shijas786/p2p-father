import { ethers } from "ethers";
import { config } from "dotenv";
config();

async function main() {
    const BASE_RPC = process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/sw59DoGWlBSmzxHbuFSNY";
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    const txHash = "0x08b29469eaa34cb533274c2bfec030d0f9754a5894d3eda18fb1fc5e20566500";
    
    try {
        const tx = await provider.getTransaction(txHash);
        if (!tx) {
            console.log("Transaction not found on Base.");
            return;
        }
        console.log("Transaction found:");
        console.log("From:", tx.from);
        console.log("To:", tx.to);
        console.log("Value:", ethers.formatEther(tx.value), "ETH");
        
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
            console.log("Status:", receipt.status === 1 ? "Success" : "Failed");
            console.log("Logs count:", receipt.logs.length);
            // Parse ERC20 Transfer if possible
            for (const log of receipt.logs) {
                if (log.topics[0] === ethers.id("Transfer(address,address,uint256)")) {
                    const from = ethers.getAddress("0x" + log.topics[1].slice(26));
                    const to = ethers.getAddress("0x" + log.topics[2].slice(26));
                    const value = ethers.toBigInt(log.data);
                    console.log(`Log: Transfer from ${from} to ${to} value ${ethers.formatUnits(value, 6)} (or 18 decimals: ${ethers.formatUnits(value, 18)})`);
                }
            }
        }
    } catch (e: any) {
        console.error("Error fetching transaction:", e);
    }
}

main();
