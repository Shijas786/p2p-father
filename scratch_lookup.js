
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

async function main() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        console.error("Missing Supabase env vars.");
        return;
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Looking up users containing 'Tokyo'...");
    const { data, error } = await supabase
        .from("users")
        .select("id, username, first_name, telegram_id")
        .ilike("username", "%Tokyo%");

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log("Found:", JSON.stringify(data, null, 2));
}

main().catch(console.error);
