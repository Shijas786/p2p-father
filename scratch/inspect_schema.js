const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Inspecting schema...");

    // Query columns of trade_messages
    const { data: cols, error: err } = await supabase.rpc("inspect_table_columns", { table_name: "trade_messages" });
    
    if (err) {
        // Fallback: Query one row or schema via sql query if rpc doesn't exist
        console.log("RPC inspect_table_columns not found. Trying direct select...");
        const { data: row, error: rowErr } = await supabase.from("trade_messages").select("*").limit(1);
        if (rowErr) {
            console.error("Error fetching row:", rowErr);
        } else {
            console.log("Sample row keys from trade_messages:", row.length > 0 ? Object.keys(row[0]) : "No rows found");
        }
    } else {
        console.log("trade_messages columns:", cols);
    }

    const { data: tradesRow, error: tradesErr } = await supabase.from("trades").select("*").limit(1);
    if (tradesErr) {
        console.error("Error fetching trades:", tradesErr);
    } else {
        console.log("Sample row keys from trades:", tradesRow.length > 0 ? Object.keys(tradesRow[0]) : "No rows found");
    }
}

main().catch(console.error);
