import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    const provider = (escrow as any).getProvider("bsc");
    const contract = (escrow as any).getEscrowContract("bsc");
    const address = await contract.getAddress();
    const user = "0x6C31212a23040998E1D1c157ACe3982aBDBE3154";

    const filter = {
        address: address,
        topics: [
            ethers.id("TradeCreated(uint256,address,address,address,uint256,uint256,uint256)"),
            null,
            ethers.zeroPadValue(user, 32)
        ]
    };

    const START_BLOCK = 86050000;
    const END_BLOCK = 86065000;
    const CHUNK_SIZE = 10;

    console.log(`Searching blocks ${START_BLOCK} to ${END_BLOCK}...`);

    for (let current = START_BLOCK; current < END_BLOCK; current += CHUNK_SIZE) {
        const from = current;
        const to = Math.min(END_BLOCK, current + CHUNK_SIZE - 1);

        // Parallelize a bit to speed up
        const promises = [];
        for (let i = 0; i < 5; i++) { // 5 chunks at a time
            const subFrom = current + (i * CHUNK_SIZE);
            const subTo = Math.min(END_BLOCK, subFrom + CHUNK_SIZE - 1);
            if (subFrom >= END_BLOCK) break;
            promises.push(provider.getLogs({ ...filter, fromBlock: subFrom, toBlock: subTo }));
        }

        try {
            const results = await Promise.all(promises);
            for (const logs of results) {
                for (const log of logs) {
                    const parsed = contract.interface.parseLog(log);
                    if (parsed) {
                        console.log(`[Block ${log.blockNumber}] Trade #${parsed.args.tradeId} Created! Amount: ${ethers.formatUnits(parsed.args.amount, 18)}, TX: ${log.transactionHash}`);
                    }
                }
            }
        } catch (e: any) {
            // console.error(`Error in range ${from}: ${e.message.slice(0, 50)}`);
        }

        current += (4 * CHUNK_SIZE); // Jump because of parallel
    }
}

main().catch(console.error);
