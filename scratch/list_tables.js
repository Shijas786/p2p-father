const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Listing tables by querying standard table routes...");
    const tables = [
        "users", "orders", "trades", "trade_messages", "payment_proofs", 
        "fees", "ad_broadcasts", "referrals", "miniapp_trades", 
        "autoclaim_skips", "miniapp_positions", "miniapp_predictions_cache"
    ];
    for (const table of tables) {
        try {
            const { data, error } = await supabase.from(table).select("*").limit(1);
            if (error) {
                console.log(`❌ Table '${table}' does not exist or errored:`, error.message);
            } else {
                console.log(`✅ Table '${table}' exists. Rows: ${data.length ? "has data" : "empty"}`);
                if (data.length > 0) {
                    console.log(`   Keys:`, Object.keys(data[0]));
                }
            }
        } catch (e) {
            console.log(`❌ Table '${table}' check error:`, e.message);
        }
    }
}

main().catch(console.error);
