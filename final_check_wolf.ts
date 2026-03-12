import { db } from "./src/db/client";
import { escrow } from "./src/services/escrow";
import { env } from "./src/config/env";
import { ethers } from "ethers";

async function main() {
    const userId = "15d42840-0387-4c85-be27-67516e994465"; // Cryptowolf07
    const user = await db.getUserById(userId);
    const userAddress = user?.wallet_address;
    const usdtBsc = "0x55d398326f99059fF775485246999027B3197955";

    console.log("--- Database State ---");
    const { data: trades } = await (db as any).getClient()
        .from("trades")
        .select("*")
        .eq("seller_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);

    console.log("Recent Trades (DB):");
    trades.forEach((t: any) => {
        console.log(`- ID: ${t.id.slice(0, 8)}, On-Chain ID: ${t.on_chain_trade_id}, Status: ${t.status}, Amount: ${t.amount}`);
    });

    if (userAddress) {
        console.log("\n--- On-Chain State (BSC) ---");
        const bscContract = (escrow as any).getEscrowContract('bsc');

        const vaultBalance = await escrow.getVaultBalance(userAddress, usdtBsc, 'bsc');
        console.log(`Vault Balance: ${vaultBalance} USDT`);

        const activeCount = await bscContract.activeTradeCount(userAddress);
        console.log(`Active Trade Count: ${activeCount}`);

        const tradeCounter = await bscContract.tradeCounter();
        console.log(`Total System Trades: ${tradeCounter}`);
    }
}

main().catch(console.error);
