const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const userId = "5d80e0b2-60b1-4612-8b4d-c5c7148f85c1";
    const walletAddress = "0xdf67C1DB9108E450558f9A7Fe6196668f0b900F0";
    const depositWalletAddress = "0xD5586BaB871A49995251c7905355b7AD98335BA7";

    const { data: trades } = await supabase.from("miniapp_trades").select("*").limit(10);
    if (trades && trades.length > 0) {
        console.log("Miniapp trades sample keys:", Object.keys(trades[0]));
    }

    const { data: userTrades } = await supabase.from("miniapp_trades").select("*");
    if (userTrades) {
        const filtered = userTrades.filter(t => {
            const s = JSON.stringify(t).toLowerCase();
            return s.includes(userId.toLowerCase()) || s.includes(walletAddress.toLowerCase()) || s.includes(depositWalletAddress.toLowerCase());
        });
        console.log("Tokyo_Mafiaz miniapp trades count:", filtered.length);
        if (filtered.length > 0) {
            console.log("Sample miniapp trade:", filtered[0]);
        }
    }
}

main().catch(console.error);
