
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

async function checkTrades() {
    const telegramId = 5036584001;
    console.log(`Checking trades for Telegram ID: ${telegramId}...`);

    // First get the UUID for this telegram ID
    const { data: userData } = await supabase
        .from("users")
        .select("id, wallet_address")
        .eq("telegram_id", telegramId)
        .single();

    if (!userData) {
        console.log("User not found.");
        return;
    }

    const userId = userData.id;
    console.log(`User UUID: ${userId}`);
    console.log(`Main Bot Wallet: ${userData.wallet_address}`);

    // Check trades where this user is buyer or seller
    const { data: trades, error } = await supabase
        .from("trades")
        .select("*")
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

    if (error) {
        console.error("Error fetching trades:", error);
        return;
    }

    const addresses = new Set<string>();
    if (userData.wallet_address) addresses.add(userData.wallet_address.toLowerCase());

    console.log(`Found ${trades.length} trades.`);
    trades.forEach(trade => {
        if (trade.buyer_custom_address) addresses.add(trade.buyer_custom_address.toLowerCase());
        // Custom check for other fields if any
    });

    console.log("\nAll associated wallet addresses found:");
    Array.from(addresses).forEach(addr => console.log(`- ${addr}`));
    
    // Also check for any orders created by this user
    const { data: orders } = await supabase
        .from("orders")
        .select("payment_details")
        .eq("user_id", userId);
        
    console.log("\nChecking orders for additional payment details...");
    orders?.forEach(order => {
        if (order.payment_details && typeof order.payment_details === 'object') {
            const details = JSON.stringify(order.payment_details);
            // Search for things that look like addresses
            const ethAddrRegex = /0x[a-fA-F0-9]{40}/g;
            const matches = details.match(ethAddrRegex);
            if (matches) {
                matches.forEach(m => addresses.add(m.toLowerCase()));
            }
        }
    });
    
    console.log("\nFinal list of unique addresses:");
    Array.from(addresses).forEach(addr => console.log(`- ${addr}`));
}

checkTrades().catch(console.error);
