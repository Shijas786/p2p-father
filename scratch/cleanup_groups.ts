import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function run() {
    try {
        console.log("Starting cleanup of non-group broadcast targets...");

        // Filter by ID greater than 0 since group chat IDs are always negative in Telegram
        const { data: deleted, error } = await supabase
            .from("bot_groups")
            .delete()
            .gt("chat_id", 0)
            .select();

        if (error) {
            throw error;
        }

        console.log(`Successfully removed ${deleted?.length || 0} private chat entries from broadcast list.`);
        
        const { data: remaining } = await supabase
            .from("bot_groups")
            .select("chat_id");
            
        console.log(`Remaining group count: ${remaining?.length || 0}`);
        console.log("Remaining IDs:", remaining?.map(r => r.chat_id));

        process.exit(0);
    } catch (err) {
        console.error("Failed to clean up database:", err);
        process.exit(1);
    }
}

run();
