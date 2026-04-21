
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

async function findAddress() {
    const addr = "0x6ba70cb10e2519e284c51af52980a514fbbff98b";
    
    // Check users
    const { data: u1 } = await supabase.from("users").select("username").eq("wallet_address", addr);
    const { data: u2 } = await supabase.from("users").select("username").eq("receive_address", addr);
    
    // Check trades
    const { data: t1 } = await supabase.from("trades").select("id").eq("buyer_custom_address", addr);
    
    // Check orders (payment_details is jsonb)
    const { data: o1 } = await supabase.from("orders").select("id, payment_details");
    const matchedOrders = o1?.filter(o => JSON.stringify(o.payment_details).toLowerCase().includes(addr.toLowerCase())) || [];

    console.log(`Address: ${addr}`);
    console.log(`Users with this as wallet_address: ${JSON.stringify(u1)}`);
    console.log(`Users with this as receive_address: ${JSON.stringify(u2)}`);
    console.log(`Trades with this as buyer_custom_address: ${JSON.stringify(t1)}`);
    console.log(`Orders matching this in payment_details: ${matchedOrders.length}`);
}

findAddress().catch(console.error);
