import { db } from "../src/db/client";

async function main() {
    const client = db.getClient();
    
    // Check if table copy_connections exists
    console.log("Checking if copy_connections table exists...");
    const { data: ccData, error: ccError } = await client
        .from("copy_connections")
        .select("*")
        .limit(1);
        
    if (ccError) {
        console.error("❌ copy_connections check failed:", ccError.message);
    } else {
        console.log("✅ copy_connections table exists!");
    }

    // Check if prediction_user_stats has allow_copy_trading column
    console.log("Checking if allow_copy_trading column exists in prediction_user_stats...");
    const { data: statsData, error: statsError } = await client
        .from("prediction_user_stats")
        .select("allow_copy_trading")
        .limit(1);
        
    if (statsError) {
        console.error("❌ allow_copy_trading column check failed:", statsError.message);
    } else {
        console.log("✅ allow_copy_trading column exists in prediction_user_stats!");
    }
}

main().catch(console.error);
