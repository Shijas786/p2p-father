import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    const userAddress = "0x6C31212a23040998E1D1c157ACe3982aBDBE3154";
    const bscContract = (escrow as any).getEscrowContract('bsc');

    try {
        const counter = await bscContract.tradeCounter();
        console.log(`Current Trade Counter: ${counter}`);

        const activeCount = await bscContract.activeTradeCount(userAddress);
        console.log(`User Active Trade Count: ${activeCount}`);

        const maxActive = await bscContract.maxActiveTradesPerUser();
        console.log(`Max Active Trades per User: ${maxActive}`);

        // Let's try to check the relayer address
        const relayer = await (escrow as any).getRelayer('bsc').address;
        console.log(`Relayer Address: ${relayer}`);

    } catch (err: any) {
        console.error("Error:", err.message);
    }
}

main().catch(console.error);
