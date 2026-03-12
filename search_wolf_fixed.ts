import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    const contract = (escrow as any).getEscrowContract("bsc");
    const user = "0x6C31212a23040998E1D1c157ACe3982aBDBE3154";
    const counter = Number(await contract.tradeCounter());

    console.log(`Checking trades ${Math.max(1, counter - 20)} to ${counter}...`);

    for (let i = Math.max(1, counter - 20); i <= counter; i++) {
        try {
            const t = await contract.getTrade(i);
            const seller = t.seller || t[0];
            const buyer = t.buyer || t[1];

            if (seller.toLowerCase() === user.toLowerCase() || buyer.toLowerCase() === user.toLowerCase()) {
                console.log(`Trade #${i}: Role=${seller.toLowerCase() === user.toLowerCase() ? 'Seller' : 'Buyer'}, Status=${t.status || t[6]}, Amount=${ethers.formatUnits(t.amount || t[3], 18)}`);
            }
        } catch (e: any) {
            // Check if it's #63 or #65
            if (i === 63 || i === 65) {
                console.log(`Trade #${i} Reverted: ${e.message.slice(0, 80)}`);
            }
        }
    }
}

main().catch(console.error);
