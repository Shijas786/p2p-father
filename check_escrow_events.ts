import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    console.log("Fetching Escrow Events on BSC...");

    const bscContract = (escrow as any).getEscrowContract('bsc');
    const filter = bscContract.filters.TradeCreated();

    // Get last 1000 blocks
    const latestBlock = await (escrow as any).getProvider('bsc').getBlockNumber();
    const events = await bscContract.queryFilter(filter, latestBlock - 5000, latestBlock);

    console.log(`Found ${events.length} TradeCreated events in the last 5000 blocks.`);

    for (const event of events) {
        if (event instanceof ethers.EventLog) {
            const { tradeId, seller, buyer, amount } = event.args;
            console.log(`- Trade #${tradeId}: ${seller} -> ${buyer}, Amount: ${ethers.formatUnits(amount, 18)}`);
        }
    }

    const counter = await bscContract.tradeCounter();
    console.log(`\nCurrent on-chain tradeCounter: ${counter}`);
}

main().catch(console.error);
