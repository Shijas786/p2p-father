import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    const bscContract = (escrow as any).getEscrowContract('bsc');
    const userAddress = "0x6C31212a23040998E1D1c157ACe3982aBDBE3154";

    const counter = await bscContract.tradeCounter();
    console.log(`Searching 1 to ${counter}...`);

    for (let i = 1; i <= Number(counter); i++) {
        try {
            const trade = await bscContract.getTrade(i);
            const isUser = trade.seller.toLowerCase() === userAddress.toLowerCase() ||
                trade.buyer.toLowerCase() === userAddress.toLowerCase();

            if (isUser) {
                console.log(`Trade #${i}: Party=${isUser ? 'YES' : 'NO'}, Status=${trade.status}, Amount=${ethers.formatUnits(trade.amount, 18)}`);
            }
        } catch (e: any) {
            // Only log if it's a party we expect and it fails
            if (i === 63 || i === 65) {
                console.log(`Trade #${i}: REVERTED (${e.message.slice(0, 100)})`);
            }
        }
    }
}

main().catch(console.error);
