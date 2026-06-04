import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

async function run() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
        console.error("Missing Supabase configuration in environment variables");
        return;
    }
    const supabase = createClient(url, key);

    console.log("Searching for user with username 'Xaudaddys'...");
    const { data: users, error: userError } = await supabase
        .from('users')
        .select('*')
        .ilike('username', 'Xaudaddys');

    if (userError) {
        console.error("Error fetching user:", userError);
        return;
    }

    if (!users || users.length === 0) {
        console.log("No user found with username Xaudaddys.");
        return;
    }

    const user = users[0];
    console.log(`Found User: ID=${user.id}, Username=${user.username}, Wallet=${user.wallet_address}, Telegram=${user.telegram_id}`);

    console.log(`Fetching trades for user ID: ${user.id}...`);
    const { data: trades, error: tradeError } = await supabase
        .from('trades')
        .select('id, status, amount, token, chain, buyer_id, seller_id, created_at, dispute_reason, fiat_amount')
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(10);

    if (tradeError) {
        console.error("Error fetching trades:", tradeError);
        return;
    }

    console.log(`Found ${trades.length} recent trades:`);
    for (const t of trades) {
        const role = t.seller_id === user.id ? 'SELLER' : 'BUYER';
        console.log(`- Trade ${t.id}:`);
        console.log(`  Status: ${t.status}`);
        console.log(`  Role: ${role}`);
        console.log(`  Amount: ${t.amount} ${t.token} on ${t.chain}`);
        console.log(`  Fiat Amount: ${t.fiat_amount}`);
        console.log(`  Created At: ${t.created_at}`);
        console.log(`  Dispute Reason: ${t.dispute_reason}`);
    }
}

run();
