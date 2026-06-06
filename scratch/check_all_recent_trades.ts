import { db } from "../src/db/client";

async function main() {
    const client = db.getClient();
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    
    console.log(`Checking for trades since: ${fifteenMinsAgo}`);
    const { data: trades, error } = await client
        .from("miniapp_trades")
        .select("*")
        .gt("created_at", fifteenMinsAgo)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("DB error:", error);
        return;
    }

    console.log(`Found ${trades?.length} trades in the last 15 minutes:`, JSON.stringify(trades, null, 2));
}

main().catch(console.error);
