const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

async function main() {
    const userId = "a94ec579-7daf-4774-a68f-c4af02d0883a";
    const telegramId = "6703895267";

    const tables = ["orders", "trades", "miniapp_trades", "miniapp_positions", "trade_messages", "payment_proofs", "ad_broadcasts"];

    for (const table of tables) {
        try {
            const { data } = await supabase.from(table).select("*");
            if (!data) continue;
            const matches = data.filter(r => {
                const s = JSON.stringify(r).toLowerCase();
                return s.includes(userId.toLowerCase()) || s.includes(telegramId);
            });
            console.log(`Table '${table}' matches count: ${matches.length}`);
            if (matches.length > 0) {
                console.log(JSON.stringify(matches, null, 2));
            }
        } catch (e) {
            console.log(`Table '${table}' query error:`, e.message);
        }
    }
}

main().catch(console.error);
