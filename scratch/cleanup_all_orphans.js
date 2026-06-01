const { createClient } = require("@supabase/supabase-js");
const { Bot } = require("grammy");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!supabaseUrl || !supabaseKey || !botToken) {
    console.error("Missing configuration in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new Bot(botToken);

// Helper to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("Starting full cleanup of non-active ad broadcasts...");

    // 1. Fetch all broadcasts
    const { data: broadcasts, error: bErr } = await supabase
        .from("ad_broadcasts")
        .select("*");

    if (bErr) throw bErr;
    console.log(`Found ${broadcasts.length} total broadcast records in DB.`);

    // 2. Fetch all orders that are NOT active
    const { data: inactiveOrders, error: oErr } = await supabase
        .from("orders")
        .select("id, status")
        .neq("status", "active");

    if (oErr) throw oErr;
    
    const inactiveOrderIds = new Set(inactiveOrders.map(o => o.id));
    console.log(`Found ${inactiveOrderIds.size} inactive orders in DB.`);

    // Filter broadcasts that belong to inactive orders
    const toDelete = broadcasts.filter(b => inactiveOrderIds.has(b.order_id));
    console.log(`Found ${toDelete.length} broadcasts that belong to inactive orders.`);

    if (toDelete.length === 0) {
        console.log("No broadcasts to delete.");
        return;
    }

    // Delete in batches to avoid hitting Telegram rate limits
    const batchSize = 10;
    for (let i = 0; i < toDelete.length; i += batchSize) {
        const batch = toDelete.slice(i, i + batchSize);
        console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(toDelete.length / batchSize)}...`);

        await Promise.all(batch.map(async (b) => {
            try {
                // Delete from Telegram
                await bot.api.deleteMessage(b.chat_id, b.message_id);
                // console.log(`Deleted message ${b.message_id} from chat ${b.chat_id}`);
            } catch (err) {
                // Ignore if already deleted or bot can't access
                // console.log(`Could not delete message ${b.message_id} in chat ${b.chat_id}: ${err.message}`);
            }

            try {
                // Delete from DB
                await supabase
                    .from("ad_broadcasts")
                    .delete()
                    .eq("id", b.id);
            } catch (dbErr) {
                console.error(`Failed to delete record ${b.id} from DB:`, dbErr.message);
            }
        }));

        // Delay 1 second between batches to be safe with Telegram rate limits
        await delay(1000);
    }

    console.log("🎉 Full cleanup complete!");
}

main().catch(console.error);
