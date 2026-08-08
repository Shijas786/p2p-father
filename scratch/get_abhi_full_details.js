const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

async function main() {
    const userId = "bf1dd99c-da36-4e74-bffe-2bf5edd4961e";
    const { data: user } = await supabase.from("users").select("*").eq("id", userId).single();

    console.log("=== USER PROFILE ===");
    console.log(`Username: @${user.username} (${user.first_name})`);
    console.log(`Telegram ID: ${user.telegram_id}`);
    console.log(`Wallet Address: ${user.wallet_address}`);
    console.log(`Deposit Wallet (Proxy): ${user.deposit_wallet_address}`);
    console.log(`Total Volume: $${user.total_volume}`);
    console.log(`Completed Trades: ${user.completed_trades} / ${user.trade_count}`);

    const { data: trades } = await supabase.from("trades").select("*").or(`buyer_id.eq.${userId},seller_id.eq.${userId}`).order("created_at", { ascending: false });

    // Map user names
    const userIds = new Set();
    trades.forEach(t => {
        if (t.buyer_id) userIds.add(t.buyer_id);
        if (t.seller_id) userIds.add(t.seller_id);
    });

    const { data: usersList } = await supabase.from("users").select("id, username, first_name").in("id", Array.from(userIds));

    const userMap = {};
    (usersList || []).forEach(u => {
        userMap[u.id] = `@${u.username || u.first_name}`;
    });

    console.log("\n=== ALL TRADES FOR @Abhi ===");
    trades.forEach((t, i) => {
        const isBuyer = t.buyer_id === userId;
        const role = isBuyer ? "BUYER" : "SELLER";
        const counterparty = isBuyer ? userMap[t.seller_id] : userMap[t.buyer_id];
        console.log(`[${i+1}] Trade ID: ${t.id}`);
        console.log(`    Date: ${t.created_at}`);
        console.log(`    Role: ${role} | Counterparty: ${counterparty}`);
        console.log(`    Crypto: ${t.crypto_amount || t.amount} USDT`);
        console.log(`    Fiat: ₹${t.fiat_amount || t.total_price}`);
        console.log(`    Status: ${t.status}`);
    });
}

main().catch(console.error);
