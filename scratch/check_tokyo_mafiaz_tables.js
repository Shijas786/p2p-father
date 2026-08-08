const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const userId = "5d80e0b2-60b1-4612-8b4d-c5c7148f85c1";
    const telegramId = "6160980308";
    const username = "Tokyo_Mafiaz";
    const walletAddress = "0xdf67C1DB9108E450558f9A7Fe6196668f0b900F0";
    const depositWalletAddress = "0xD5586BaB871A49995251c7905355b7AD98335BA7";

    console.log("Searching all tables for user Tokyo_Mafiaz...");

    const tables = ["orders", "trades", "miniapp_trades", "miniapp_positions", "trade_messages", "payment_proofs", "fees", "referrals"];

    for (const table of tables) {
        try {
            const { data, error } = await supabase.from(table).select("*");
            if (error) {
                console.log(`Error querying ${table}:`, error.message);
                continue;
            }
            if (!data) continue;

            const matches = data.filter(row => {
                const str = JSON.stringify(row).toLowerCase();
                return str.includes(userId.toLowerCase()) ||
                       str.includes(telegramId) ||
                       str.includes("tokyo_mafiaz") ||
                       str.includes(walletAddress.toLowerCase()) ||
                       str.includes(depositWalletAddress.toLowerCase());
            });

            console.log(`\n================ Table: ${table} (Total rows: ${data.length}, Matches: ${matches.length}) ================`);
            if (matches.length > 0) {
                // sort matches by created_at or timestamp if present
                matches.sort((a, b) => new Date(b.created_at || b.timestamp || 0) - new Date(a.created_at || a.timestamp || 0));
                console.log(JSON.stringify(matches.slice(0, 15), null, 2));
            }
        } catch (e) {
            console.log(`Error on table ${table}:`, e.message);
        }
    }
}

main().catch(console.error);
