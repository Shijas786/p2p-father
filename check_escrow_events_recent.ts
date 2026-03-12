import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    const userAddress = "0x6C31212a23040998E1D1c157ACe3982aBDBE3154";
    const bscContract = (escrow as any).getEscrowContract('bsc');

    // Simpler ABI that might avoid the revert if the tuple is the issue
    // Actually, I'll just try to get specific fields if I can find them
    // But getTrade returns a tuple.

    // Let's try to find the "Refund" event for trade 63
    const refundFilter = bscContract.filters.TradeRefunded(63);
    const releaseFilter = bscContract.filters.TradeReleased(63);

    const latestBlock = await (escrow as any).getProvider('bsc').getBlockNumber();
    console.log(`Current Block: ${latestBlock}`);

    // BSC RPC limit is 10 blocks. This is very small.
    // I'll check last 10 blocks for ANY events.
    const allEvents = await bscContract.queryFilter("*", latestBlock - 10, latestBlock);
    console.log(`Found ${allEvents.length} events in last 10 blocks.`);
    for (const event of allEvents) {
        console.log(`- Event: ${event.eventName}`, event.args);
    }
}

main().catch(console.error);
