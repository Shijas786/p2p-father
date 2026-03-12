import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    const provider = (escrow as any).getProvider("bsc");
    const contract = (escrow as any).getEscrowContract("bsc");
    const address = await contract.getAddress();
    const user = "0x6C31212a23040998E1D1c157ACe3982aBDBE3154";

    // TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, address token, uint256 amount, uint256 feeAmount, uint256 deadline)
    const filter = {
        address: address,
        topics: [
            ethers.id("TradeCreated(uint256,address,address,address,uint256,uint256,uint256)"),
            null,
            ethers.zeroPadValue(user, 32)
        ]
    };

    const latest = await provider.getBlockNumber();
    console.log(`Current block: ${latest}`);

    // Search last 10,000 blocks in chunks of 1000 to be safe with RPC limits
    const CHUNK_SIZE = 1000;
    const END_BLOCK = latest;
    const START_BLOCK = latest - 10000;

    for (let current = END_BLOCK; current > START_BLOCK; current -= CHUNK_SIZE) {
        const from = Math.max(START_BLOCK, current - CHUNK_SIZE);
        const to = current;
        console.log(`Searching blocks ${from} to ${to}...`);
        try {
            const logs = await provider.getLogs({
                ...filter,
                fromBlock: from,
                toBlock: to
            });

            for (const log of logs) {
                const parsed = contract.interface.parseLog(log);
                if (parsed) {
                    console.log(`[Block ${log.blockNumber}] Trade #${parsed.args.tradeId} Created! Amount: ${ethers.formatUnits(parsed.args.amount, 18)}, TX: ${log.transactionHash}`);
                }
            }
        } catch (e: any) {
            console.error(`Error in range ${from}-${to}: ${e.message.slice(0, 100)}`);
        }
    }
}

main().catch(console.error);
