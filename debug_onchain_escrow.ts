import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    const userAddress = "0x6C31212a23040998E1D1c157ACe3982aBDBE3154";
    const usdtBsc = "0x55d398326f99059fF775485246999027B3197955";

    console.log("Checking On-Chain State for Cryptowolf07 (BSC)");

    const bscContract = (escrow as any).getEscrowContract('bsc');

    // 1. Check User Vault Balance
    const balance = await bscContract.balances(userAddress, usdtBsc);
    console.log(`Vault Balance mapping: ${ethers.formatUnits(balance, 18)} USDT`);

    // 2. Check Trades
    const tradeIds = [63, 64, 65];
    for (const id of tradeIds) {
        try {
            const trade = await bscContract.getTrade(id);
            console.log(`\n--- On-Chain Trade #${id} ---`);
            console.log("Seller:", trade.seller);
            console.log("Buyer:", trade.buyer);
            console.log("Amount:", ethers.formatUnits(trade.amount, 18));
            console.log("Status Index:", trade.status); // 1=Locked, 2=FiatSent, 3=Released, 4=Refunded
            console.log("Locked At:", new Date(Number(trade.createdAt) * 1000).toISOString());
        } catch (e) {
            console.log(`Trade #${id} not found or error.`);
        }
    }
}

main().catch(console.error);
