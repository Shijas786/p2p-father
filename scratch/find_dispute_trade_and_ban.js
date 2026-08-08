const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

async function main() {
    console.log("1. Finding user @vip_trader...");
    const { data: cmdrUsers } = await supabase.from("users").select("*").or("username.eq.vip_trader,username.ilike.vip_trader");
    
    if (!cmdrUsers || cmdrUsers.length === 0) {
        console.error("User @vip_trader not found!");
        return;
    }

    const cmdrAj = cmdrUsers[0];
    console.log(`Found @vip_trader ID: ${cmdrAj.id} | Telegram ID: ${cmdrAj.telegram_id}`);

    console.log("\n2. Searching for trades involving @vip_trader on 8/5/2026 around 200 USDT...");
    const { data: trades, error } = await supabase
        .from("trades")
        .select("*")
        .or(`buyer_id.eq.${cmdrAj.id},seller_id.eq.${cmdrAj.id}`)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching trades:", error);
        return;
    }

    console.log(`Total trades involving @vip_trader: ${trades.length}`);

    // Print recent trades
    const recentTrades = trades.slice(0, 10);
    
    // Map user names
    const userIds = new Set();
    recentTrades.forEach(t => {
        if (t.buyer_id) userIds.add(t.buyer_id);
        if (t.seller_id) userIds.add(t.seller_id);
    });

    const { data: usersList } = await supabase.from("users").select("*").in("id", Array.from(userIds));

    const userMap = {};
    (usersList || []).forEach(u => {
        userMap[u.id] = u;
    });

    console.log("\nRecent trades for @vip_trader:");
    recentTrades.forEach((t, i) => {
        const isCmdrSeller = t.seller_id === cmdrAj.id;
        const buyer = userMap[t.buyer_id] || {};
        const seller = userMap[t.seller_id] || {};
        const cryptoAmt = t.crypto_amount || t.amount;
        console.log(`[${i+1}] Trade ID: ${t.id} | Date: ${t.created_at} | Crypto: ${cryptoAmt} USDT | Status: ${t.status}`);
        console.log(`    Buyer: @${buyer.username || buyer.first_name} (ID: ${buyer.id}, TG: ${buyer.telegram_id})`);
        console.log(`    Seller: @${seller.username || seller.first_name} (ID: ${seller.id}, TG: ${seller.telegram_id})`);
    });

    // Let's filter for 200 USDT trade on 2026-08-05 where vip_trader is seller
    const targetTrade = trades.find(t => {
        const amt = Number(t.crypto_amount || t.amount || 0);
        const isToday = t.created_at.startsWith("2026-08-05");
        const is200 = Math.abs(amt - 200) < 1;
        const isCmdrSeller = t.seller_id === cmdrAj.id;
        return isCmdrSeller && (isToday || is200);
    });

    if (targetTrade) {
        console.log("\n================ TARGET DISPUTE TRADE FOUND ================");
        console.log(JSON.stringify(targetTrade, null, 2));

        const buyerUser = userMap[targetTrade.buyer_id];
        if (buyerUser) {
            console.log("\n================ BUYER TO BE BANNED ================");
            console.log(`ID: ${buyerUser.id}`);
            console.log(`Username: @${buyerUser.username}`);
            console.log(`First Name: ${buyerUser.first_name}`);
            console.log(`Telegram ID: ${buyerUser.telegram_id}`);
            console.log(`Current is_banned status: ${buyerUser.is_banned}`);

            // Perform Ban update
            console.log("\nBanning buyer in Supabase database...");
            const { data: updatedUser, error: banErr } = await supabase
                .from("users")
                .update({ is_banned: true })
                .eq("id", buyerUser.id)
                .select()
                .single();

            if (banErr) {
                console.error("Error banning user:", banErr);
            } else {
                console.log("✅ USER BANNED SUCCESSFULLY!");
                console.log("Updated User Data:", JSON.stringify(updatedUser, null, 2));
            }
        } else {
            console.error("Buyer user details not found!");
        }
    } else {
        console.log("\nCould not automatically narrow down to single 200 USDT trade, showing all recent 8/5 trades:");
        const todayTrades = trades.filter(t => t.created_at.startsWith("2026-08-05"));
        console.log(JSON.stringify(todayTrades, null, 2));
    }
}

main().catch(console.error);
