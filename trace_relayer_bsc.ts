import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    const provider = (escrow as any).getProvider("bsc");
    const relayer = "0x3A5668F8B3E167771d503F0321c42a7B082789Ef";
    const escrowAddr = "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";

    const START_BLOCK = 86057000;
    const END_BLOCK = 86058000;

    console.log(`Searching blocks ${START_BLOCK} to ${END_BLOCK} for Relayer -> Escrow transactions...`);

    for (let i = START_BLOCK; i <= END_BLOCK; i++) {
        try {
            const block = await provider.getBlock(i, true);
            if (!block) continue;

            for (const tx of (block as any).prefetchedTransactions) {
                if (tx.from.toLowerCase() === relayer.toLowerCase() && tx.to?.toLowerCase() === escrowAddr.toLowerCase()) {
                    console.log(`[Block ${i}] Hash: ${tx.hash}`);
                    const receipt = await provider.getTransactionReceipt(tx.hash);
                    if (receipt) {
                        for (const log of receipt.logs) {
                            if (log.address.toLowerCase() === escrowAddr.toLowerCase()) {
                                try {
                                    const parsed = (escrow as any).getEscrowContract("bsc").interface.parseLog(log);
                                    if (parsed) {
                                        console.log(`  - Event: ${parsed.name} | Args: ${JSON.stringify(parsed.args)}`);
                                    }
                                } catch (e) { }
                            }
                        }
                    }
                }
            }
        } catch (e: any) {
            // console.error(`Err ${i}: ${e.message}`);
        }
    }
}

main().catch(console.error);
