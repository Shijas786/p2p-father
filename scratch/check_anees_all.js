const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

async function main() {
    const { data: users } = await supabase.from("users").select("*");
    const matches = users.filter(u => JSON.stringify(u).toLowerCase().includes("anees"));
    console.log("All matching users containing 'anees':", JSON.stringify(matches, null, 2));
}

main().catch(console.error);
