const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

async function main() {
    console.log("Searching for user @Anees108...");
    
    // Search by username or text
    const { data: users, error } = await supabase.from("users").select("*");
    if (error) {
        console.error("Error fetching users:", error);
        return;
    }

    const matches = users.filter(u => {
        const s = JSON.stringify(u).toLowerCase();
        return s.includes("anees108") || s.includes("anees");
    });

    console.log(`Matched users count: ${matches.length}`);
    if (matches.length === 0) {
        console.log("No user found with username Anees108");
        return;
    }

    for (const user of matches) {
        console.log(`\n================ PROFILE FOR @${user.username || user.first_name} ================`);
        console.log(`ID: ${user.id}`);
        console.log(`Username: @${user.username}`);
        console.log(`First Name: ${user.first_name}`);
        console.log(`Telegram ID: ${user.telegram_id}`);
        console.log(`UPI ID: ${user.upi_id}`);
        console.log(`Total Volume: $${user.total_volume}`);
        console.log(`Completed Trades: ${user.completed_trades} / ${user.trade_count}`);
        console.log(`Deposit Wallet (Proxy): ${user.deposit_wallet_address}`);

        const { data: trades, error: tradesErr } = await supabase
            .from("trades")
            .select("*")
            .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
            .order("created_at", { ascending: false });

        if (tradesErr) {
            console.error("Trades error:", tradesErr);
            continue;
        }

        console.log(`Total Trades: ${trades.length}`);

        // Fetch counterparty names
        const userIds = new Set();
        trades.forEach(t => {
            if (t.buyer_id) userIds.add(t.buyer_id);
            if (t.seller_id) userIds.add(t.seller_id);
        });

        const { data: counterUsers } = await supabase
            .from("users")
            .select("id, username, first_name")
            .in("id", Array.from(userIds));

        const userMap = {};
        (counterUsers || []).forEach(u => {
            userMap[u.id] = `@${u.username || u.first_name || 'User'}`;
        });

        const tradeList = trades.map((t, idx) => {
            const isBuyer = t.buyer_id === user.id;
            const role = isBuyer ? "BUYER" : "SELLER";
            const counterparty = userMap[isBuyer ? t.seller_id : t.buyer_id] || 'Unknown';
            const cryptoAmt = t.crypto_amount || t.amount;
            const fiatAmt = t.fiat_amount || t.total_price;
            return {
                idx: idx + 1,
                id: t.id,
                date: t.created_at,
                role,
                counterparty,
                cryptoAmt,
                fiatAmt,
                status: t.status
            };
        });

        console.log(JSON.stringify(tradeList, null, 2));
    }
}

main().catch(console.error);
