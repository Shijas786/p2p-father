import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    const provider = (escrow as any).getProvider('bsc');
    const contractAddress = (escrow as any).getContractAddress('bsc');
    const userAddress = "0x6C31212a23040998E1D1c157ACe3982aBDBE3154";

    console.log(`Checking transactions to ${contractAddress} in last 100 blocks...`);

    const latestBlock = await provider.getBlockNumber();

    for (let i = latestBlock; i > latestBlock - 100; i--) {
        const block = await provider.getBlock(i, true);
        if (!block) continue;

        for (const tx of block.prefetchedTransactions) {
            if (tx.to?.toLowerCase() === contractAddress.toLowerCase()) {
                console.log(`\nBlock ${i}: Transaction to Contract!`);
                console.log(`- Hash: ${tx.hash}`);
                console.log(`- From: ${tx.from}`);
                console.log(`- Value: ${ethers.formatEther(tx.value)} BNB`);

                try {
                    const iface = new ethers.Interface((escrow as any).getEscrowContract('bsc').interface.fragments);
                    const decoded = iface.parseTransaction({ data: tx.data });
                    if (decoded) {
                        console.log(`- Method: ${decoded.name}`);
                        console.log(`- Args:`, decoded.args);
                    }
                } catch (e) {
                    console.log(`- Method: Could not decode (${tx.data.slice(0, 10)})`);
                }
            }
        }
    }
}

main().catch(console.error);
