import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

const EOA = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";
const PROXY = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";

async function run() {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!);
    
    // Update deposit_wallet_address to PROXY for the user
    const { data, error } = await supabase
        .from('users')
        .update({ deposit_wallet_address: PROXY })
        .ilike('wallet_address', EOA)
        .select();
        
    if (error) {
        console.error("Error updating user:", error);
    } else {
        console.log("Update Success! User Data:", data);
    }
}
run();
