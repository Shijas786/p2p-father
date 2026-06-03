import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

async function run() {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.from('users').select('wallet_index, wallet_address').ilike('wallet_address', '0x365d1970c1453bfB446F3fa57Ff440c05c2A5799');
    console.log("Data:", data);
}
run();
