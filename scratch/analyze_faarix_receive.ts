
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

async function analyzeAddresses() {
    const telegramId = 5036584001;
    
    const { data: userData } = await supabase
        .from("users")
        .select("id, wallet_address, receive_address")
        .eq("telegram_id", telegramId)
        .single();

    if (!userData) return;

    const { data: trades } = await supabase
        .from("trades")
        .select("buyer_custom_address, buyer_id")
        .eq("buyer_id", userData.id);

    console.log("Profile Receive Address:", userData.receive_address || "NOT SET");
    console.log("Bot Wallet Address:", userData.wallet_address);
    
    if (trades && trades.length > 0) {
        const customCounts: Record<string, number> = {};
        trades.forEach(t => {
            if (t.buyer_custom_address) {
                const addr = t.buyer_custom_address.toLowerCase();
                customCounts[addr] = (customCounts[addr] || 0) + 1;
            }
        });
        
        console.log("\nAddresses used in buyer_custom_address:");
        Object.entries(customCounts).forEach(([addr, count]) => {
            console.log(`- ${addr}: ${count} time(s)`);
        });
    }
}

analyzeAddresses().catch(console.error);
