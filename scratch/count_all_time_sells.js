const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

async function main() {
    const userId = "5d80e0b2-60b1-4612-8b4d-c5c7148f85c1";
    const { data: trades } = await supabase.from("trades").select("*").or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

    let allSells = 0;
    let allBuys = 0;
    let allSellUsdt = 0;
    let allBuyUsdt = 0;

    trades.forEach(t => {
        const isSeller = t.seller_id === userId;
        const amt = Number(t.crypto_amount || t.amount || 0);
        if (t.status === 'completed') {
            if (isSeller) {
                allSells++;
                allSellUsdt += amt;
            } else {
                allBuys++;
                allBuyUsdt += amt;
            }
        }
    });

    console.log(`All time completed sells: ${allSells} (${allSellUsdt.toFixed(2)} USDT)`);
    console.log(`All time completed buys: ${allBuys} (${allBuyUsdt.toFixed(2)} USDT)`);
}

main();
