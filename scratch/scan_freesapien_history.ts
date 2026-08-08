import { ethers } from "ethers";
import axios from "axios";

async function main() {
    const walletAddress = "0x6540Bb882aE5b710C5a0efd9F76dada30ac7F9cF";
    console.log("=== Fetching Blockscout Tx History for Wallet ===");
    console.log("Wallet:", walletAddress);

    try {
        const url = `https://base.blockscout.com/api/v2/addresses/${walletAddress}/token-transfers`;
        const res = await axios.get(url);
        if (res.data && res.data.items && Array.isArray(res.data.items)) {
            console.log(`Found ${res.data.items.length} token transfers on Base Blockscout:`);
            for (const item of res.data.items.slice(0, 10)) {
                console.log(`TxHash: ${item.tx_hash}`);
                console.log(`  Token: ${item.token?.symbol} (${item.token?.name})`);
                console.log(`  From: ${item.from?.hash}`);
                console.log(`  To: ${item.to?.hash}`);
                console.log(`  Value: ${ethers.formatUnits(item.total?.value || "0", parseInt(item.token?.decimals || "6"))}`);
                console.log(`  Time: ${item.timestamp}`);
                console.log("---");
            }
        } else {
            console.log("Blockscout API response:", res.data);
        }
    } catch (e: any) {
        console.error("Error querying Blockscout API:", e.message);
    }
}

main().catch(console.error);
