import { db } from "../src/db/client";
import { getQualifyingVIPConfig } from "../src/config/feeCashback";

async function main() {
    console.log("=== Checking @vip_trader Trade & Order Info ===");
    
    const client = db.getClient();

    // Find vip_trader user
    const cmdrAj = await db.getUserByTelegramId(987654321);
    console.log("vip_trader User Profile:", cmdrAj);

    if (!cmdrAj) {
        console.log("User @vip_trader not found");
        return;
    }

    // Get orders created by vip_trader
    const { data: orders, error: orderErr } = await client
        .from("orders")
        .select("*")
        .eq("user_id", cmdrAj.id)
        .order("created_at", { ascending: false })
        .limit(5);

    if (orderErr) {
        console.error("Order error:", orderErr);
        return;
    }

    console.log(`Found ${orders?.length || 0} recent orders for @vip_trader:`);
    for (const order of orders || []) {
        console.log(`\nOrder ID: ${order.id}`);
        console.log(`Type: ${order.type} | Token: ${order.token} | Amount: ${order.amount} | Status: ${order.status}`);
        console.log(`Created At: ${order.created_at} (${new Date(order.created_at).getTime()})`);

        const vipCheck = getQualifyingVIPConfig(
            cmdrAj.telegram_id,
            cmdrAj.username,
            order.created_at
        );
        console.log(`VIP Qualified for Cashback? ${vipCheck ? "✅ YES (0.25%)" : "❌ NO (Exempt/Old)"}`);

        // Find trades for this order
        const { data: trades, error: tradeErr } = await client
            .from("trades")
            .select("*")
            .eq("order_id", order.id)
            .order("created_at", { ascending: false });

        if (trades && trades.length > 0) {
            console.log(`  Trades (${trades.length}):`);
            for (const t of trades) {
                console.log(`    Trade ID: ${t.id} | Status: ${t.status} | Amount: ${t.amount} | Fiat: ₹${t.fiat_amount} | Created: ${t.created_at}`);
            }
        } else {
            console.log(`  No trades found for order ${order.id}`);
        }
    }

    // Also check overall most recent trades in database to see if he was buyer or seller
    console.log("\n=== Checking overall recent trades involving @vip_trader ===");
    const { data: allTrades } = await client
        .from("trades")
        .select("*")
        .or(`seller_id.eq.${cmdrAj.id},buyer_id.eq.${cmdrAj.id}`)
        .order("created_at", { ascending: false })
        .limit(5);

    console.log("Recent Trades where @vip_trader was buyer/seller:", allTrades);

    console.log("\n=== Checking top 5 most recent completed trades across platform ===");
    const { data: latestCompleted } = await client
        .from("trades")
        .select("*")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(5);
    console.log(latestCompleted);
}

main().catch(console.error);
