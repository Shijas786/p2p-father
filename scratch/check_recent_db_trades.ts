import { db } from "../src/db/client";

async function main() {
    console.log("Checking recent prediction trades in database...");
    const client = db.getClient();
    const { data: trades, error } = await client
        .from("prediction_trades")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error fetching trades:", error);
        return;
    }

    console.log(`Fetched ${trades?.length || 0} trades:`);
    for (const t of trades || []) {
        console.log(`- ID: ${t.id}, Username: ${t.username}, Side: ${t.side}, Outcome: ${t.outcome}, Price: ${t.price}, Shares: ${t.shares}, Resolved: ${t.resolved}, Resolution: ${t.resolution}, Claimed: ${t.claimed}, Traded At: ${t.traded_at}`);
    }
}

main().catch(console.error);
