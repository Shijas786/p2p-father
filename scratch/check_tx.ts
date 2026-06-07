import { ethers } from "ethers";
import "dotenv/config";

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
    const txHash = "0x67ce458f8c61cc502976eca453ca8a7d1a9238ee60a51c8d50c2051723901966";
    
    console.log(`Fetching receipt for transaction ${txHash}...`);
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt) {
        console.log("Transaction receipt not found. Transaction might be pending or invalid.");
        return;
    }
    
    console.log(`Status: ${receipt.status === 1 ? "SUCCESS ✅" : "FAILED ❌"}`);
    console.log(`Block Number: ${receipt.blockNumber}`);
    console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
    
    // Let's print any Transfer logs for pUSD (0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB)
    const pusdAddress = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
    const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    
    console.log("\nToken Transfers in this transaction:");
    for (const log of receipt.logs) {
        if (log.address.toLowerCase() === pusdAddress.toLowerCase() && log.topics[0] === transferTopic) {
            const from = "0x" + log.topics[1].slice(26);
            const to = "0x" + log.topics[2].slice(26);
            const amount = ethers.formatUnits(log.data, 6);
            console.log(`- pUSD Transfer: $${amount} from ${from} to ${to}`);
        } else {
            // Check other ERC20 token transfers
            if (log.topics[0] === transferTopic && log.topics.length >= 3) {
                try {
                    const from = "0x" + log.topics[1].slice(26);
                    const to = "0x" + log.topics[2].slice(26);
                    const amount = log.data === "0x" ? "0" : ethers.formatUnits(log.data, 6);
                    console.log(`- Token (${log.address}): Transfer $${amount} from ${from} to ${to}`);
                } catch (e) {}
            }
        }
    }
}

main().catch(console.error);
