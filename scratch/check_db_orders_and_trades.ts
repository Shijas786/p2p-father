import { db } from "../src/db/client";

async function main() {
    console.log("=== Checking Active Orders & Trades in DB ===");
    const client = (db as any).getClient();

    // 1. Active Orders
    const { data: activeOrders } = await client
        .from("orders")
        .select("id, type, amount, rate, token, chain, user_id, users(username, first_name, telegram_id, wallet_address)")
        .eq("status", "active");

    console.log(`\nActive Orders (${activeOrders?.length || 0}):`);
    for (const o of (activeOrders || [])) {
        console.log(`- Ad #${o.id.slice(0, 8)} | ${o.type.toUpperCase()} ${o.amount} ${o.token} on ${o.chain} | User: @${o.users?.username || o.users?.first_name || o.users?.telegram_id} (${o.users?.wallet_address})`);
    }

    // 2. Active Trades (In Escrow / Fiat Sent)
    const { data: activeTrades } = await client
        .from("trades")
        .select("id, amount, token, chain, status, seller_id, buyer_id, seller:seller_id(username, first_name, telegram_id, wallet_address), buyer:buyer_id(username, first_name, telegram_id, wallet_address)")
        .in("status", ["waiting_for_escrow", "in_escrow", "fiat_sent", "disputed"]);

    console.log(`\nActive Trades (${activeTrades?.length || 0}):`);
    for (const t of (activeTrades || [])) {
        console.log(`- Trade #${t.id.slice(0, 8)} | ${t.amount} ${t.token} on ${t.chain} [${t.status}] | Seller: @${t.seller?.username || t.seller?.first_name || t.seller?.telegram_id} | Buyer: @${t.buyer?.username || t.buyer?.first_name || t.buyer?.telegram_id}`);
    }
}

main().catch(console.error);
