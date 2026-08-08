const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Searching for users matching 'abhi'...");

  const { data: users, error: userErr } = await supabase
    .from("users")
    .select("*")
    .or("username.ilike.%abhi%,first_name.ilike.%abhi%");

  if (userErr) {
    console.error("Error searching users:", userErr);
    return;
  }

  console.log(`Found ${users?.length || 0} matching user(s) for 'abhi':`);

  for (const user of users || []) {
    console.log(`\n======================================================`);
    console.log(`USER PROFILE: @${user.username || 'N/A'} (Name: ${user.first_name || ''}, TG ID: ${user.telegram_id})`);
    console.log(`User ID: ${user.id}`);
    console.log(`UPI ID: ${user.upi_id || 'N/A'}`);
    console.log(`Wallet Index: ${user.wallet_index} (${user.wallet_address})`);
    console.log(`KYC Status: ${user.kyc_status || 'N/A'}`);
    console.log(`Trust Score: ${user.trust_score}`);

    // Fetch trades
    const { data: trades, error: tradesErr } = await supabase
      .from("trades")
      .select("*")
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (tradesErr) {
      console.error(`Error fetching trades for ${user.id}:`, tradesErr);
      continue;
    }

    console.log(`Total trades found: ${trades?.length || 0}`);

    if (trades && trades.length > 0) {
      const counterpartyIds = new Set();
      trades.forEach(t => {
        if (t.buyer_id && t.buyer_id !== user.id) counterpartyIds.add(t.buyer_id);
        if (t.seller_id && t.seller_id !== user.id) counterpartyIds.add(t.seller_id);
      });

      const { data: counterparties } = await supabase
        .from("users")
        .select("id, username, first_name")
        .in("id", Array.from(counterpartyIds));

      const cpMap = {};
      (counterparties || []).forEach(cp => {
        cpMap[cp.id] = `@${cp.username || cp.first_name || 'User'}`;
      });

      let completedCount = 0;
      let cancelledCount = 0;
      let refundedCount = 0;
      let disputeCount = 0;

      let totalBoughtUsdt = 0;
      let totalBoughtInr = 0;
      let totalSoldUsdt = 0;
      let totalSoldInr = 0;

      const formatted = trades.map((t, i) => {
        const isBuyer = t.buyer_id === user.id;
        const role = isBuyer ? "BUYER" : "SELLER";
        const cpId = isBuyer ? t.seller_id : t.buyer_id;
        const counterparty = cpMap[cpId] || cpId || 'Unknown';
        const cryptoAmt = Number(t.crypto_amount || t.amount || 0);
        const fiatAmt = Number(t.fiat_amount || t.total_price || 0);
        const status = t.status || 'unknown';

        if (status === 'completed') {
          completedCount++;
          if (isBuyer) {
            totalBoughtUsdt += cryptoAmt;
            totalBoughtInr += fiatAmt;
          } else {
            totalSoldUsdt += cryptoAmt;
            totalSoldInr += fiatAmt;
          }
        } else if (status === 'cancelled') {
          cancelledCount++;
        } else if (status === 'refunded') {
          refundedCount++;
        } else if (status === 'disputed' || status === 'dispute') {
          disputeCount++;
        }

        return {
          index: i + 1,
          trade_id: t.id,
          created_at: t.created_at,
          role,
          counterparty,
          crypto_amount: cryptoAmt,
          fiat_amount: fiatAmt,
          price_per_usdt: fiatAmt && cryptoAmt ? (fiatAmt / cryptoAmt).toFixed(2) : 0,
          status,
          payment_method: t.payment_method || t.upi_id || 'N/A'
        };
      });

      console.log("\n=== STATS SUMMARY ===");
      console.log(`Total Trades: ${trades.length}`);
      console.log(`Completed: ${completedCount}`);
      console.log(`Cancelled: ${cancelledCount}`);
      console.log(`Refunded: ${refundedCount}`);
      console.log(`Disputed: ${disputeCount}`);
      console.log(`USDT Bought: ${totalBoughtUsdt.toFixed(2)} USDT (₹${totalBoughtInr.toFixed(2)})`);
      console.log(`USDT Sold: ${totalSoldUsdt.toFixed(2)} USDT (₹${totalSoldInr.toFixed(2)})`);

      console.log("\n=== FULL TRADES LIST ===");
      console.log(JSON.stringify(formatted, null, 2));
    }
  }
}

main().catch(console.error);
