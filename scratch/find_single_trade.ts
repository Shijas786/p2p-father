import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

async function run() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
        console.error("Missing Supabase configuration in environment variables");
        return;
    }
    const supabase = createClient(url, key);

    const tradeId = 'fa0595c5-cd83-4a48-8c0d-49cf5f4c5cb0';
    console.log(`Fetching trade details for ID: ${tradeId}...`);
    const { data: trade, error } = await supabase
        .from('trades')
        .select('*')
        .eq('id', tradeId)
        .single();

    if (error) {
        console.error("Error fetching trade:", error);
        return;
    }

    console.log("Full Trade details:");
    console.log(JSON.stringify(trade, null, 2));
}

run();
