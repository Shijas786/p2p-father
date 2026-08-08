const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const userId = "5d80e0b2-60b1-4612-8b4d-c5c7148f85c1";
    const now = new Date("2026-08-05T22:25:00Z");
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 2026-07-06

    console.log(`Fetching trade history for Tokyo_Mafiaz from ${thirtyDaysAgo.toISOString()} to ${now.toISOString()}...`);

    const { data: trades, error } = await supabase
        .from("trades")
        .select("*")
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching trades:", error);
        return;
    }

    console.log(`Total trades in last 30 days: ${trades.length}`);

    // Map counterparty names
    const userIds = new Set();
    trades.forEach(t => {
        if (t.buyer_id) userIds.add(t.buyer_id);
        if (t.seller_id) userIds.add(t.seller_id);
    });

    const { data: usersList } = await supabase
        .from("users")
        .select("id, username, first_name")
        .in("id", Array.from(userIds));

    const userMap = {};
    (usersList || []).forEach(u => {
        userMap[u.id] = `@${u.username || u.first_name || 'User'}`;
    });

    let totalBoughtUsdt = 0;
    let totalBoughtInr = 0;
    let totalSoldUsdt = 0;
    let totalSoldInr = 0;
    let completedCount = 0;
    let refundedCount = 0;
    let cancelledCount = 0;
    let otherCount = 0;

    const formattedTrades = trades.map((t, idx) => {
        const isBuyer = t.buyer_id === userId;
        const role = isBuyer ? "BUYER" : "SELLER";
        const counterpartyId = isBuyer ? t.seller_id : t.buyer_id;
        const counterparty = userMap[counterpartyId] || counterpartyId || 'Unknown';
        const cryptoAmount = Number(t.crypto_amount || t.amount || 0);
        const fiatAmount = Number(t.fiat_amount || t.total_price || 0);
        const status = t.status || 'unknown';

        if (status === 'completed') {
            completedCount++;
            if (isBuyer) {
                totalBoughtUsdt += cryptoAmount;
                totalBoughtInr += fiatAmount;
            } else {
                totalSoldUsdt += cryptoAmount;
                totalSoldInr += fiatAmount;
            }
        } else if (status === 'refunded') {
            refundedCount++;
        } else if (status === 'cancelled') {
            cancelledCount++;
        } else {
            otherCount++;
        }

        return {
            index: idx + 1,
            id: t.id,
            date: t.created_at,
            role,
            counterparty,
            cryptoAmount,
            fiatAmount,
            status
        };
    });

    console.log("\n=== 30-DAY SUMMARY STATS ===");
    console.log(`Total Trades: ${trades.length}`);
    console.log(`Completed Trades: ${completedCount}`);
    console.log(`Refunded Trades: ${refundedCount}`);
    console.log(`Cancelled Trades: ${cancelledCount}`);
    console.log(`Other Status Trades: ${otherCount}`);
    console.log(`Total USDT Bought: ${totalBoughtUsdt.toFixed(2)} USDT (₹${totalBoughtInr.toFixed(2)})`);
    console.log(`Total USDT Sold: ${totalSoldUsdt.toFixed(2)} USDT (₹${totalSoldInr.toFixed(2)})`);

    console.log("\n=== ALL 30-DAY TRADES ===");
    console.log(JSON.stringify(formattedTrades, null, 2));
}

main().catch(console.error);
