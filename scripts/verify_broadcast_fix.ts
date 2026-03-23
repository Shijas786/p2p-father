import { db } from "../src/db/client";
import { broadcastTradeSuccess } from "../src/bot/index";

async function main() {
    console.log("🚀 Testing Unified Broadcast Logic...");

    // 1. Get a completed trade for testing
    const { data: trades } = await (db as any).getClient()
        .from("trades")
        .select("*, orders(*)")
        .eq("status", "completed")
        .limit(1);

    if (!trades || trades.length === 0) {
        console.log("No completed trades found to test with.");
        return;
    }

    const trade = trades[0];
    const order = trade.orders;

    console.log(`Using Trade ID: ${trade.id}`);

    // Mock buyer/seller info as expected by broadcastTradeSuccess
    const buyer = await db.getUserById(trade.buyer_id);
    const seller = await db.getUserById(trade.seller_id);

    const tradeWithInfo = {
        ...trade,
        buyer_username: buyer?.username,
        buyer_first_name: buyer?.first_name,
        seller_username: seller?.username,
        seller_first_name: seller?.first_name,
    };

    console.log("Calling broadcastTradeSuccess...");
    try {
        await broadcastTradeSuccess(tradeWithInfo, order);
        console.log("✅ broadcastTradeSuccess executed successfully.");
    } catch (err) {
        console.error("❌ broadcastTradeSuccess failed:", err);
    }
}

main().catch(console.error);
