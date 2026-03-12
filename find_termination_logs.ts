import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    const provider = (escrow as any).getProvider("bsc");
    const contract = (escrow as any).getEscrowContract("bsc");
    const address = await contract.getAddress();
    const tradeId = 63;

    const topics = [
        [
            ethers.id("TradeReleased(uint256,address,uint256,uint256)"),
            ethers.id("TradeRefunded(uint256,address,uint256)"),
            ethers.id("TradeCancelled(uint256,address)"),
            ethers.id("AutoReleased(uint256,address,uint256,uint256)")
        ],
        ethers.zeroPadValue(ethers.toBeHex(tradeId), 32)
    ];

    const CREATION_BLOCK = 86057598;
    const latest = await provider.getBlockNumber();
    console.log(`Searching from block ${CREATION_BLOCK} to ${latest} for termination events of Trade #63...`);

    const CHUNK_SIZE = 10;
    for (let current = CREATION_BLOCK; current < latest; current += CHUNK_SIZE * 5) {
        const promises = [];
        for (let j = 0; j < 5; j++) {
            const from = current + (j * CHUNK_SIZE);
            const to = Math.min(latest, from + CHUNK_SIZE - 1);
            if (from >= latest) break;
            promises.push(provider.getLogs({ address, topics, fromBlock: from, toBlock: to }));
        }

        try {
            const results = await Promise.all(promises);
            for (const logs of results) {
                for (const log of logs) {
                    const parsed = contract.interface.parseLog(log);
                    if (parsed) {
                        console.log(`[Block ${log.blockNumber}] EVENT: ${parsed.name} | TX: ${log.transactionHash}`);
                    }
                }
            }
        } catch (e) { }
    }
}

main().catch(console.error);
