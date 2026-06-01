const { createClient } = require("@supabase/supabase-js");
const { Bot } = require("grammy");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const botToken = process.env.TELEGRAM_BOT_TOKEN; // corrected here

if (!supabaseUrl || !supabaseKey || !botToken) {
    console.error("Missing configuration in .env");
    console.log("URL:", supabaseUrl, "Key:", supabaseKey ? "EXISTS" : "MISSING", "Token:", botToken ? "EXISTS" : "MISSING");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new Bot(botToken);

async function main() {
    const orderId = "542ba0a9-1322-46f9-9808-822360c167b1";
    console.log(`Manually cleaning up broadcasts for order ${orderId}...`);

    const { data: broadcasts, error: bErr } = await supabase
        .from("ad_broadcasts")
        .select("*")
        .eq("order_id", orderId);

    if (bErr) throw bErr;
    console.log("Found broadcasts in DB:", broadcasts);

    if (broadcasts && broadcasts.length > 0) {
        for (const b of broadcasts) {
            try {
                console.log(`Deleting message ${b.message_id} in chat ${b.chat_id}...`);
                await bot.api.deleteMessage(b.chat_id, b.message_id);
                console.log(`✅ Success deleting ${b.message_id}`);
            } catch (err) {
                console.error(`❌ Failed to delete message ${b.message_id} in chat ${b.chat_id}:`, err.message);
            }
        }

        // Delete from database
        const { error: delErr } = await supabase
            .from("ad_broadcasts")
            .delete()
            .eq("order_id", orderId);

        if (delErr) {
            console.error("Failed to delete records from DB:", delErr.message);
        } else {
            console.log("✅ Deleted broadcast records from database");
        }
    } else {
        console.log("No broadcasts found to clean up.");
    }
}

main().catch(console.error);
