import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

async function checkOrusmonActivity() {
    console.log("🔍 Checking trades, orders, and history for user @orusmon (Telegram ID: 8329551982)...");

    const telegramId = 8329551982;
    const { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();

    console.log("\nUser record:", user);

    if (user) {
        const { data: buyerTrades } = await supabase.from("trades").select("*").eq("buyer_id", user.id);
        const { data: sellerTrades } = await supabase.from("trades").select("*").eq("seller_id", user.id);
        const { data: userOrders } = await supabase.from("orders").select("*").eq("user_id", user.id);

        console.log(`\n📦 Orders created: ${userOrders?.length || 0}`);
        if (userOrders && userOrders.length > 0) {
            console.log(userOrders);
        }

        console.log(`\n🔄 Trades as Buyer: ${buyerTrades?.length || 0}`);
        if (buyerTrades && buyerTrades.length > 0) {
            console.log(buyerTrades);
        }

        console.log(`\n🔄 Trades as Seller: ${sellerTrades?.length || 0}`);
        if (sellerTrades && sellerTrades.length > 0) {
            console.log(sellerTrades);
        }
    }
}

checkOrusmonActivity().catch(console.error);
