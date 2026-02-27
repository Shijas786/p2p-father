import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function main() {
    const { data, error } = await supabase.from("bot_groups").select("*");
    console.log("Groups Data:", data);
    console.log("Groups Error:", error);
}

main().catch(console.error);
