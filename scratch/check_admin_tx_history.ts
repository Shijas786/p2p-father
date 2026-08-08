import axios from "axios";
import { ethers } from "ethers";

async function checkAdmin(chain: string, url: string) {
    console.log(`\n=================== Admin Tx History on ${chain.toUpperCase()} ===================`);
    try {
        const res = await axios.get(url);
        if (res.data && res.data.items && Array.isArray(res.data.items)) {
            console.log(`Found ${res.data.items.length} transactions for Admin Wallet on ${chain}:`);
            for (const item of res.data.items.slice(0, 15)) {
                console.log(`TxHash: ${item.hash}`);
                console.log(`  To: ${item.to?.hash}`);
                console.log(`  Value: ${ethers.formatEther(item.value || "0")} ETH/BNB`);
                console.log(`  Method: ${item.method || item.to?.is_contract ? 'Contract Call' : 'Transfer'}`);
                console.log(`  Time: ${item.timestamp}`);
                console.log("---");
            }
        } else {
            console.log("Blockscout response:", res.data);
        }
    } catch (e: any) {
        console.error(`Error querying Blockscout API for ${chain}:`, e.message);
    }
}

async function main() {
    const adminAddr = "0x3A5668F8B3E167771d503F0321c42a7B082789Ef";
    await checkAdmin("base", `https://base.blockscout.com/api/v2/addresses/${adminAddr}/transactions`);
    await checkAdmin("bsc", `https://bsc.blockscout.com/api/v2/addresses/${adminAddr}/transactions`);
}

main().catch(console.error);
