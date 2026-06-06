import { syncPredictionTrades } from "../src/jobs/syncPredictionTrades";
import { resolvePredictionTrades } from "../src/jobs/resolvePredictionTrades";
import { db } from "../src/db/client";

async function main() {
    console.log("Running manual sync...");
    await syncPredictionTrades();

    console.log("Running manual resolution...");
    await resolvePredictionTrades();

    const client = db.getClient();
    const { data: latestTrades, error } = await client
        .from("prediction_trades")
        .select("*")
        .order("traded_at", { ascending: false })
        .limit(3);

    if (error) {
        console.error("Error fetching latest trades:", error.message);
    } else {
        console.log("Latest DB prediction trades:", JSON.stringify(latestTrades, null, 2));
    }
}

main().catch(console.error);
