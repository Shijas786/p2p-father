import { createClient } from "@supabase/supabase-js";
import { broadcastTradeSuccess } from "../src/bot";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function run() {
    try {
        // Fetch the last completed trade
        const { data: trades, error } = await supabase
            .from("trades")
            .select("*, seller:users!trades_seller_id_fkey(username, first_name), buyer:users!trades_buyer_id_fkey(username, first_name)")
            .order("created_at", { ascending: false })
            .limit(1);
        
        if (error) throw error;
        if (!trades || trades.length === 0) {
            console.log("No trades found.");
            return;
        }

        const rawTrade = trades[0];
        const tradeWithUsername = {
            ...rawTrade,
            seller_username: rawTrade.seller?.username,
            seller_first_name: rawTrade.seller?.first_name,
            buyer_username: rawTrade.buyer?.username,
            buyer_first_name: rawTrade.buyer?.first_name,
        };
        
        console.log("Broadcasting trade ID:", rawTrade.id);
        console.log("Buyer Username:", rawTrade.buyer?.username);
        
        // Call the fixed broadcast function
        await broadcastTradeSuccess(tradeWithUsername, { chain: rawTrade.chain });
        console.log("🎉 Successfully broadcasted retroactive update!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Error broadcasting:", err);
        process.exit(1);
    }
}

run();
