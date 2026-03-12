import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    const provider = (escrow as any).getProvider("bsc");
    const contract = (escrow as any).getEscrowContract("bsc");
    const user = "0x6C31212a23040998E1D1c157ACe3982aBDBE3154";

    const count = await contract.activeTradeCount(user);
    console.log(`Active trade count for Cryptowolf07: ${count}`);

    // Check a known random address to baseline
    const randomCount = await contract.activeTradeCount("0x1234567890123456789012345678901234567890");
    console.log(`Active trade count for Random: ${randomCount}`);

    const tradeCounter = await contract.tradeCounter();
    console.log(`Trade counter: ${tradeCounter}`);

    console.log("Searching for active trades...");
    for (let i = 1; i <= Number(tradeCounter); i++) {
        try {
            // Use low-level call to see if it reverts
            const data = await provider.call({
                to: await contract.getAddress(),
                data: "0x2db25e05" + i.toString(16).padStart(64, '0')
            });

            if (data !== "0x") {
                console.log(`Trade #${i} returned data. Length: ${data.length}`);
                // Try decoding manually with the known ABI if data found
                try {
                    const t = await contract.getTrade(i);
                    console.log(` - Decoded #${i}: Seller=${t.seller}, Status=${t.status}`);
                } catch (e) {
                    console.log(` - FAILED TO DECODE #${i} despite data`);
                }
            }
        } catch (e: any) {
            // Reverted
        }
    }
}

main().catch(console.error);
