import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    const bscContract = (escrow as any).getEscrowContract('bsc');
    const userAddress = "0x6C31212a23040998E1D1c157ACe3982aBDBE3154";

    const counter = await bscContract.tradeCounter();
    console.log(`Checking trades 1 to ${counter}...`);

    for (let i = 1; i <= Number(counter); i++) {
        try {
            // Try to get just the seller and buyer without the full tuple if possible
            // But we only have getTrade.
            const trade = await bscContract.getTrade(i);
            const seller = trade[0] || trade.seller;
            const buyer = trade[1] || trade.buyer;

            if (seller.toLowerCase() === userAddress.toLowerCase() || buyer.toLowerCase() === userAddress.toLowerCase()) {
                console.log(`\nTrade #${i}:`);
                console.log(`- Role: ${seller.toLowerCase() === userAddress.toLowerCase() ? 'Seller' : 'Buyer'}`);
                console.log(`- Amount: ${ethers.formatUnits(trade.amount || trade[3], 18)}`);
                console.log(`- Status: ${trade.status || trade[6]}`);
            }
        } catch (e) {
            // Ignore reverts
        }
    }
}

main().catch(console.error);
