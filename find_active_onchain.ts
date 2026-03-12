import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    const bscContract = (escrow as any).getEscrowContract('bsc');
    const userAddress = "0x6C31212a23040998E1D1c157ACe3982aBDBE3154";

    console.log("Locating active trade on-chain for:", userAddress);

    const counter = await bscContract.tradeCounter();
    const count = Number(counter);

    for (let i = Math.max(1, count - 10); i <= count; i++) {
        try {
            const trade = await bscContract.getTrade(i);
            if (trade.seller.toLowerCase() === userAddress.toLowerCase() || trade.buyer.toLowerCase() === userAddress.toLowerCase()) {
                console.log(`\nTrade #${i}:`);
                console.log(`- Seller: ${trade.seller}`);
                console.log(`- Buyer: ${trade.buyer}`);
                console.log(`- Amount: ${ethers.formatUnits(trade.amount, 18)} USDT`);
                console.log(`- Status: ${trade.status}`); // 1=Locked, 2=FiatSent, 3=Released, 4=Refunded

                const statusMap: Record<number, string> = {
                    0: "None",
                    1: "Locked",
                    2: "FiatSent",
                    3: "Released",
                    4: "Refunded",
                    5: "Cancelled"
                };
                console.log(`- Status Name: ${statusMap[Number(trade.status)]}`);
            }
        } catch (e: any) {
            // console.log(`Trade #${i}: Reverted (${e.message.slice(0, 50)})`);
        }
    }
}

main().catch(console.error);
