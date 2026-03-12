import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    const bscContract = (escrow as any).getEscrowContract('bsc');

    try {
        const counter = await bscContract.tradeCounter();
        console.log(`Current on-chain tradeCounter: ${counter}`);

        // Let's try to get the 5 most recent trades
        const startId = Number(counter) > 5 ? Number(counter) - 5 : 0;
        for (let i = startId; i <= Number(counter); i++) {
            if (i === 0) continue;
            try {
                const trade = await bscContract.getTrade(i);
                console.log(`\nTrade #${i}: Seller=${trade.seller}, Status=${trade.status}, Amount=${ethers.formatUnits(trade.amount, 18)}`);
            } catch (e) {
                console.log(`Trade #${i}: Failed to fetch`);
            }
        }
    } catch (err: any) {
        console.error("Error checking counter:", err.message);
    }
}

main().catch(console.error);
