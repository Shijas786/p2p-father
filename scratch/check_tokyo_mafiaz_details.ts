import { db } from "../src/db/client";
import { config } from "dotenv";
config();

async function main() {
    const client = db.getClient();
    const userId = "5d80e0b2-60b1-4612-8b4d-c5c7148f85c1";
    const telegramId = 6160980308;
    const walletAddress = "0xdf67C1DB9108E450558f9A7Fe6196668f0b900F0";
    const depositWalletAddress = "0xD5586BaB871A49995251c7905355b7AD98335BA7";

    console.log("=== CHECKING USER TRADES FOR TOKYO_MAFIAZ ===");

    // 1. Check orders (P2P / general)
    console.log("\n--- Checking 'orders' table ---");
    const { data: orders, error: err1 } = await client
        .from("orders")
        .select("*")
        .or(`user_id.eq.${userId},creator_id.eq.${userId},buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(20);
    if (err1) console.log("orders error:", err1.message);
    else console.log("Orders count:", orders?.length, JSON.stringify(orders, null, 2));

    // 2. Check p2p_orders
    console.log("\n--- Checking 'p2p_orders' table ---");
    const { data: p2pOrders, error: err2 } = await client
        .from("p2p_orders")
        .select("*")
        .or(`user_id.eq.${userId},creator_id.eq.${userId},buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(20);
    if (err2) console.log("p2p_orders error:", err2.message);
    else console.log("P2P Orders count:", p2pOrders?.length, JSON.stringify(p2pOrders, null, 2));

    // 3. Check p2p_trades
    console.log("\n--- Checking 'p2p_trades' table ---");
    const { data: p2pTrades, error: err3 } = await client
        .from("p2p_trades")
        .select("*")
        .or(`user_id.eq.${userId},buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(20);
    if (err3) console.log("p2p_trades error:", err3.message);
    else console.log("P2P Trades count:", p2pTrades?.length, JSON.stringify(p2pTrades, null, 2));

    // 4. Check trades
    console.log("\n--- Checking 'trades' table ---");
    const { data: trades, error: err4 } = await client
        .from("trades")
        .select("*")
        .or(`user_id.eq.${userId},buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(20);
    if (err4) console.log("trades error:", err4.message);
    else console.log("Trades count:", trades?.length, JSON.stringify(trades, null, 2));

    // 5. Check predictions table
    console.log("\n--- Checking 'predictions' table ---");
    const { data: predictions, error: err5 } = await client
        .from("predictions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
    if (err5) console.log("predictions error:", err5.message);
    else console.log("Predictions count:", predictions?.length, JSON.stringify(predictions, null, 2));

    // 6. Check transactions table
    console.log("\n--- Checking 'transactions' table ---");
    const { data: txs, error: err6 } = await client
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
    if (err6) console.log("transactions error:", err6.message);
    else console.log("Transactions count:", txs?.length, JSON.stringify(txs, null, 2));
}

main().catch(console.error);
