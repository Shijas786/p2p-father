const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

async function main() {
    console.log("Searching for user 'abhi' in users table...");
    const { data: users, error } = await supabase.from("users").select("*");
    if (error) {
        console.error("Error fetching users:", error);
        return;
    }

    const matches = users.filter(u => {
        const str = JSON.stringify(u).toLowerCase();
        return str.includes("abhi");
    });

    console.log(`Found ${matches.length} matching user(s) for 'abhi':`);
    matches.forEach(u => {
        console.log(`- ID: ${u.id} | Username: @${u.username} | Name: ${u.first_name} ${u.last_name || ''} | TG ID: ${u.telegram_id} | Completed Trades: ${u.completed_trades}/${u.trade_count}`);
    });

    if (matches.length === 0) return;

    for (const user of matches) {
        console.log(`\n================ TRADES FOR @${user.username || user.first_name} (ID: ${user.id}) ================`);
        
        const { data: trades, error: tradesErr } = await supabase
            .from("trades")
            .select("*")
            .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
            .order("created_at", { ascending: false });

        if (tradesErr) {
            console.error("Error fetching trades:", tradesErr);
            continue;
        }

        console.log(`Total Trades: ${trades.length}`);

        // Fetch user map for counterparties
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

        const last15 = trades.slice(0, 15);
        last15.forEach((t, idx) => {
            const role = t.buyer_id === user.id ? "BUYER" : "SELLER";
            const counterpartyId = t.buyer_id === user.id ? t.seller_id : t.buyer_id;
            const counterparty = userMap[counterpartyId] || counterpartyId || 'Unknown';
            const cryptoAmt = t.crypto_amount || t.amount;
            const fiatAmt = t.fiat_amount || t.total_price;

            console.log(`[${idx + 1}] ID: ${t.id} | Date: ${t.created_at} | Role: ${role} | Counterparty: ${counterparty} | Crypto: ${cryptoAmt} USDT | Fiat: ₹${fiatAmt} | Status: ${t.status}`);
        });
    }
}

main().catch(console.error);
