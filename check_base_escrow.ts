import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    console.log("Checking Base Chain State...");
    const baseContract = (escrow as any).getEscrowContract('base');
    const userAddress = "0x6C31212a23040998E1D1c157ACe3982aBDBE3154";

    try {
        const counter = await baseContract.tradeCounter();
        console.log(`Current Base Trade Counter: ${counter}`);

        const activeCount = await baseContract.activeTradeCount(userAddress);
        console.log(`User Base Active Trade Count: ${activeCount}`);

        // Check for trade 63 on base too
        if (Number(counter) >= 63) {
            const trade = await baseContract.getTrade(63);
            console.log(`Trade #63 on Base: Status=${trade.status}, Amount=${ethers.formatUnits(trade.amount, 6)}`);
        }
    } catch (err: any) {
        console.error("Base check error:", err.message);
    }
}

main().catch(console.error);
