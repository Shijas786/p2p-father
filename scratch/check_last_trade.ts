import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function run() {
    try {
        const { data: trades, error } = await supabase
            .from("trades")
            .select("*, seller:users!trades_seller_id_fkey(username, first_name), buyer:users!trades_buyer_id_fkey(username, first_name)")
            .order("created_at", { ascending: false })
            .limit(1);
        
        if (error) throw error;
        console.log("Latest trade:", JSON.stringify(trades, null, 2));
    } catch (err) {
        console.error("Error:", err);
    }
}
run();
