import { db } from "../src/db/client";

async function main() {
    const client = db.getClient();
    const { data: trades, error } = await client
        .from("prediction_trades")
        .select("*")
        .eq("resolution", "WIN")
        .eq("claimed", false);
        
    if (error) {
        console.error("Error fetching trades:", error);
        return;
    }
    
    console.log(`Found ${trades?.length || 0} WIN unclaimed trades in DB:`);
    for (const t of trades || []) {
        console.log(`- ID: ${t.id}`);
        console.log(`  Market: Bitcoin Up or Down - ${t.condition_id}`);
        console.log(`  Side: ${t.side}, Outcome: ${t.outcome}`);
        console.log(`  Shares: ${t.shares}`);
        console.log(`  Traded At: ${t.traded_at}`);
    }
}

main().catch(console.error);
