import { db } from "../src/db/client";
import { polymarketService } from "../src/services/polymarket";
import { polymarketRelayerService } from "../src/services/relayer";

async function main() {
    const { data: user } = await db.getClient()
        .from("users")
        .select("*")
        .eq("username", "shijas")
        .single();
        
    if (!user) return;
    
    const depositAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index);
    console.log(`Checking CLOB trades for wallet: ${depositAddress}`);
    
    const trades = await polymarketService.getTradesForProxy(depositAddress);
    console.log(`Fetched ${trades.length} total trades.`);
    
    console.log("LAST 15 TRADES:");
    for (let i = 0; i < Math.min(15, trades.length); i++) {
        const t = trades[i];
        const timeStr = new Date(t.timestamp * 1000).toLocaleString();
        console.log(`- [${timeStr}] ${t.side} ${t.size} shares of outcome ${t.outcomeIndex ?? t.outcome} (Price: ${t.price}) for market ${t.conditionId || t.market} TX: ${t.transactionHash}`);
    }
}

main().catch(console.error);
