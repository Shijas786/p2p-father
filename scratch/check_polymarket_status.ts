import { db } from "../src/db/client";
import { polymarketRelayerService } from "../src/services/relayer";
import { polymarketService } from "../src/services/polymarket";

async function main() {
    const client = db.getClient();
    const { data: user, error } = await client
        .from("users")
        .select("*")
        .eq("username", "shijas")
        .single();
        
    if (error || !user) {
        console.error("Failed to find user shijas:", error);
        return;
    }
    
    console.log(`Found user: ${user.username} (ID: ${user.id}, TelID: ${user.telegram_id})`);
    console.log(`Wallet Index: ${user.wallet_index}, Wallet Address: ${user.wallet_address}`);
    
    const depositAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index);
    console.log(`Resolved Deposit Wallet Address: ${depositAddress}`);
    
    // Fetch pUSD balance
    const pusdBalance = await polymarketRelayerService.getPusdBalance(user.wallet_index);
    console.log(`Current pUSD Balance on Polymarket: $${pusdBalance}`);
    
    // Fetch active positions on Polymarket
    try {
        const positions = await polymarketService.getPositionsForProxy(depositAddress);
        console.log("Active Positions on Polymarket CLOB:", JSON.stringify(positions, null, 2));
    } catch (e: any) {
        console.error("Error fetching positions:", e.message);
    }
    
    // Fetch raw trades from Polymarket CLOB
    try {
        const trades = await polymarketService.getTradesForProxy(depositAddress);
        console.log("Raw Trades from Polymarket CLOB (last 5):", JSON.stringify(trades.slice(0, 5), null, 2));
    } catch (e: any) {
        console.error("Error fetching trades:", e.message);
    }
}

main().catch(console.error);
