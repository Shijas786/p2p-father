import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

async function run() {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!);
    const { data, error } = await supabase
        .from('users')
        .update({ polymarket_api_key: 'test_key' })
        .eq('id', '15d42840-0387-4c85-be27-67516e994465')
        .select();

    if (error) {
        console.error("Update failed:", error.message || error);
    } else {
        console.log("Update succeeded! Returned data:", data);
    }
}
run();
