const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const userId = "5d80e0b2-60b1-4612-8b4d-c5c7148f85c1";

    console.log("=== USER PROFILE ===");
    const { data: user } = await supabase.from("users").select("*").eq("id", userId).single();
    console.log(`Username: @${user.username} (${user.first_name})`);
    console.log(`Telegram ID: ${user.telegram_id}`);
    console.log(`UPI ID: ${user.upi_id}`);
    console.log(`Total Volume: $${user.total_volume}`);
    console.log(`Completed Trades: ${user.completed_trades} / ${user.trade_count}`);
    console.log(`Wallet Address: ${user.wallet_address}`);
    console.log(`Deposit Wallet (Proxy): ${user.deposit_wallet_address}`);

    // 1. Fetch trades from 'trades' table
    console.log("\n================ LAST P2P TRADES (from 'trades' table) ================");
    const { data: trades, error: tradesErr } = await supabase
        .from("trades")
        .select("*")
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

    if (tradesErr) {
        console.error("Trades error:", tradesErr);
    } else {
        console.log(`Total P2P Trades found: ${trades.length}`);
        // sort by created_at desc
        trades.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        // Let's inspect the top 10 last trades
        const last10 = trades.slice(0, 10);
        
        // Fetch counterparty usernames
        const userIds = new Set();
        last10.forEach(t => {
            if (t.buyer_id) userIds.add(t.buyer_id);
            if (t.seller_id) userIds.add(t.seller_id);
        });

        const { data: usersList } = await supabase
            .from("users")
            .select("id, username, first_name")
            .in("id", Array.from(userIds));

        const userMap = {};
        (usersList || []).forEach(u => {
            userMap[u.id] = `@${u.username || u.first_name}`;
        });

        last10.forEach((t, idx) => {
            const role = t.buyer_id === userId ? "BUYER" : "SELLER";
            const counterparty = t.buyer_id === userId ? (userMap[t.seller_id] || t.seller_id) : (userMap[t.buyer_id] || t.buyer_id);
            console.log(`\n[${idx + 1}] Trade ID: ${t.id}`);
            console.log(`    Date: ${t.created_at}`);
            console.log(`    Role: ${role} | Counterparty: ${counterparty}`);
            console.log(`    Amount Crypto: ${t.crypto_amount || t.amount} USDT/Token`);
            console.log(`    Total Fiat Amount: ₹${t.fiat_amount || t.total_price}`);
            console.log(`    Price per unit: ₹${t.price}`);
            console.log(`    Status: ${t.status}`);
            console.log(`    Payment Method: ${t.payment_method || 'N/A'}`);
            if (t.payment_details) console.log(`    Payment Details:`, t.payment_details);
        });
    }

    // 2. Fetch miniapp_trades (Polymarket / Prediction Trades)
    console.log("\n================ LAST MINIAPP / PREDICTION TRADES ================");
    const { data: miniTrades, error: miniErr } = await supabase
        .from("miniapp_trades")
        .select("*")
        .eq("user_id", userId);

    if (miniErr) {
        console.error("Miniapp trades error:", miniErr);
    } else {
        console.log(`Total Miniapp Trades found: ${miniTrades?.length || 0}`);
        if (miniTrades && miniTrades.length > 0) {
            miniTrades.sort((a, b) => new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp));
            console.log(JSON.stringify(miniTrades.slice(0, 10), null, 2));
        }
    }
}

main().catch(console.error);
