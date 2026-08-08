import axios from "axios";
import { ethers } from "ethers";

async function main() {
    console.log("=== Querying Base Escrow Token Transfers from Blockscout ===");
    const escrowAddr = "0xf20872C359788a53958a048413D64F183403B1f1";

    const url = `https://base.blockscout.com/api/v2/addresses/${escrowAddr}/token-transfers`;
    const res = await axios.get(url);

    if (res.data && res.data.items && Array.isArray(res.data.items)) {
        console.log(`Found ${res.data.items.length} recent token transfers for Escrow Contract:`);
        for (const item of res.data.items.slice(0, 15)) {
            const tokenSymbol = item.token?.symbol || "TOKEN";
            const decs = parseInt(item.token?.decimals || "6");
            const val = ethers.formatUnits(item.total?.value || "0", decs);
            const isIncoming = item.to?.hash.toLowerCase() === escrowAddr.toLowerCase();
            const dir = isIncoming ? "📥 IN (Deposit)" : "📤 OUT (Release/Withdraw)";
            console.log(`${dir} | ${val} ${tokenSymbol} | From: ${item.from?.hash} -> To: ${item.to?.hash}`);
            console.log(`  Time: ${item.timestamp}`);
            console.log("---");
        }
    } else {
        console.log("Blockscout response:", res.data);
    }
}

main().catch(console.error);
