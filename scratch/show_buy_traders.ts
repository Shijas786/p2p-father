import { db } from "../src/db/client";

async function main() {
    console.log("=== Finding Buyers in P2PFather Database ===");
    const client = (db as any).getClient();

    // 1. Active BUY Ads (Traders offering to BUY crypto)
    const { data: buyOrders } = await client
        .from("orders")
        .select("id, amount, filled_amount, rate, token, chain, created_at, user_id, users(id, username, first_name, telegram_id, wallet_address, completed_trades)")
        .eq("type", "buy")
        .eq("status", "active");

    console.log(`\n=================== 1. ACTIVE BUY ADS (${buyOrders?.length || 0}) ===================`);
    for (const o of (buyOrders || [])) {
        const u = o.users;
        console.log(`Ad #${o.id.slice(0, 8)} | BUY ${o.amount} ${o.token} on ${o.chain} @ ₹${o.rate}`);
        console.log(`  User: @${u?.username || u?.first_name || u?.telegram_id} (ID: ${u?.id})`);
        console.log(`  Telegram ID: ${u?.telegram_id} | Wallet: ${u?.wallet_address}`);
        console.log("---");
    }

    // 2. Traders who have ONLY been BUYERS in trades (0 Sell Trades)
    const { data: allTrades } = await client
        .from("trades")
        .select("id, buyer_id, seller_id, status")
        .eq("status", "completed");

    const buyerCountMap: Record<string, number> = {};
    const sellerCountMap: Record<string, number> = {};

    for (const t of (allTrades || [])) {
        if (t.buyer_id) buyerCountMap[t.buyer_id] = (buyerCountMap[t.buyer_id] || 0) + 1;
        if (t.seller_id) sellerCountMap[t.seller_id] = (sellerCountMap[t.seller_id] || 0) + 1;
    }

    const buyOnlyUserIds = Object.keys(buyerCountMap).filter(uid => !sellerCountMap[uid]);

    console.log(`\n=================== 2. TRADERS WITH BUY TRADES ONLY (${buyOnlyUserIds.length}) ===================`);
    
    if (buyOnlyUserIds.length > 0) {
        const { data: buyOnlyUsers } = await client
            .from("users")
            .select("id, username, first_name, telegram_id, wallet_address, completed_trades, total_volume")
            .in("id", buyOnlyUserIds);

        for (const u of (buyOnlyUsers || [])) {
            console.log(`👤 @${u.username || u.first_name || u.telegram_id} | Telegram ID: ${u.telegram_id}`);
            console.log(`   Wallet: ${u.wallet_address}`);
            console.log(`   Buy Trades: ${buyerCountMap[u.id]} | Total Volume: $${u.total_volume || 0}`);
            console.log("---");
        }
    } else {
        console.log("No traders found with buy-only completed trades.");
    }
}

main().catch(console.error);
