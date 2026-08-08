import { db } from "../src/db/client";

async function main() {
    console.log("=== Checking @Bellaah23 Profile & Activity ===");
    const client = (db as any).getClient();

    // 1. User Profile
    const { data: user } = await client
        .from("users")
        .select("*")
        .or("username.eq.Bellaah23,username.ilike.Bellaah23")
        .single();

    if (!user) {
        console.log("User @Bellaah23 not found by exact username, searching by ilike...");
        const { data: users } = await client
            .from("users")
            .select("*")
            .ilike("username", "%Bellaah%");
        console.log("Matching users:", users);
        return;
    }

    console.log(`\n👤 Profile Details:`);
    console.log(`  User ID: ${user.id}`);
    console.log(`  Username: @${user.username} | Name: ${user.first_name || ''} ${user.last_name || ''}`);
    console.log(`  Telegram ID: ${user.telegram_id}`);
    console.log(`  Wallet Address: ${user.wallet_address}`);
    console.log(`  KYC Status: ${user.kyc_status || 'not_verified'}`);
    console.log(`  Completed Trades: ${user.completed_trades}`);
    console.log(`  Total Volume: $${user.total_volume}`);
    console.log(`  Created At: ${user.created_at}`);

    // 2. Orders
    const { data: orders } = await client
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    console.log(`\n📋 Orders Created (${orders?.length || 0}):`);
    for (const o of (orders || [])) {
        console.log(`  - Ad #${o.id.slice(0, 8)} | ${o.type.toUpperCase()} ${o.amount} ${o.token} on ${o.chain} @ ₹${o.rate} [${o.status}]`);
    }

    // 3. Trades as Buyer vs Seller
    const { data: buyTrades } = await client
        .from("trades")
        .select("*")
        .eq("buyer_id", user.id);

    const { data: sellTrades } = await client
        .from("trades")
        .select("*")
        .eq("seller_id", user.id);

    console.log(`\n🛒 Trade Activity:`);
    console.log(`  Buy Trades Count: ${buyTrades?.length || 0}`);
    for (const t of (buyTrades || [])) {
        console.log(`    └ Trade #${t.id.slice(0, 8)} | BUY ${t.amount} ${t.token} on ${t.chain} [${t.status}] | Date: ${t.created_at}`);
    }

    console.log(`  Sell Trades Count: ${sellTrades?.length || 0}`);
    for (const t of (sellTrades || [])) {
        console.log(`    └ Trade #${t.id.slice(0, 8)} | SELL ${t.amount} ${t.token} on ${t.chain} [${t.status}] | Date: ${t.created_at}`);
    }
}

main().catch(console.error);
