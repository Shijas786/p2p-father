
import { db } from "../src/db/client";

async function check() {
    const start = "2026-04-16T18:52:00Z";
    const end = "2026-04-16T18:54:00Z";
    console.log(`Checking for ADS (Orders) created between ${start} and ${end}...`);

    const { data: ads, error } = await (db as any).getClient()
        .from("orders")
        .select("id, user_id, type, amount, token, rate, created_at, users(username, first_name, telegram_id)")
        .gte("created_at", start)
        .lte("created_at", end);

    if (error) {
        console.error("Error fetching ads:", error.message);
        return;
    }

    console.log(`Found ${ads.length} ads:`);
    ads.forEach((ad: any) => {
        console.log(`- Ad ${ad.id} | User: ${ad.users.username || ad.users.first_name} (TG: ${ad.users.telegram_id}) | ${ad.type} | ${ad.amount} ${ad.token} | Created: ${ad.created_at}`);
    });

    console.log("\nChecking for TRADES created between same window...");
    const { data: trades, error: tError } = await (db as any).getClient()
        .from("trades")
        .select("id, order_id, on_chain_trade_id, amount, created_at")
        .gte("created_at", start)
        .lte("created_at", end);

    if (tError) {
        console.error("Error fetching trades:", tError.message);
        return;
    }

    console.log(`Found ${trades.length} trades:`);
    trades.forEach((t: any) => {
        console.log(`- Trade ${t.id} (On-chain: ${t.on_chain_trade_id}) | Ad: ${t.order_id} | Created: ${t.created_at}`);
    });

    console.log("\nDone.");
}

check();
