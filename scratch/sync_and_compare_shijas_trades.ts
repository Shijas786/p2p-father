import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();
import { polymarketService } from "../src/services/polymarket";

async function run() {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!);
    
    // Find shijas user
    const { data: user, error: userErr } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', 123456789)
        .single();

    if (userErr || !user) {
        console.error("User shijas not found:", userErr);
        return;
    }

    const proxyAddress = user.deposit_wallet_address || '0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02';
    console.log("Fetching real trades from Polymarket for proxy:", proxyAddress);
    
    const realTrades = await polymarketService.getTradesForProxy(proxyAddress);
    console.log(`Polymarket returned ${realTrades.length} executed trades.`);

    // Fetch db trades
    const { data: dbTrades, error: dbErr } = await supabase
        .from('prediction_trades')
        .select('*')
        .eq('telegram_id', 123456789);

    if (dbErr || !dbTrades) {
        console.error("Failed to fetch db trades:", dbErr);
        return;
    }
    console.log(`Database contains ${dbTrades.length} trades for user.`);

    // Find database trades that don't match any real trade (fake/unfilled trades)
    console.log("\n=== Checking for Database trades not in Polymarket (Fake/Unfilled) ===");
    let fakeCount = 0;
    for (const dbt of dbTrades) {
        // Match by clob_trade_id (which could be the tx hash) or by fields
        const existsInReal = realTrades.some((rt: any) => {
            const rtTx = rt.transactionHash || rt.id || '';
            const dbtTx = dbt.clob_trade_id;
            if (dbtTx === rtTx) return true;

            // Fallback matching by condition, side, outcome, size, and approximate price
            const isSameCondition = (rt.conditionId || rt.market || '').toLowerCase() === dbt.condition_id.toLowerCase();
            const isSameSide = (rt.side || 'BUY').toUpperCase() === dbt.side;
            const rtOutcome = (rt.outcomeIndex === 0 || String(rt.outcome).toUpperCase() === 'YES' || String(rt.outcome).toUpperCase() === 'UP') ? 'UP' : 'DOWN';
            const isSameOutcome = rtOutcome === dbt.outcome;
            const isSameSize = Math.abs(parseFloat(rt.size || '0') - parseFloat(dbt.shares)) < 0.001;
            const isClosePrice = Math.abs(parseFloat(rt.price || '0') - parseFloat(dbt.price)) < 0.05;

            return isSameCondition && isSameSide && isSameOutcome && isSameSize && isClosePrice;
        });

        if (!existsInReal) {
            console.log(`Fake trade: ID=${dbt.id} | TX=${dbt.clob_trade_id} | Side=${dbt.side} | Outcome=${dbt.outcome} | Cost=$${dbt.cost_usdc} | Traded At=${dbt.traded_at} | Resolved=${dbt.resolved}`);
            fakeCount++;
        }
    }
    console.log(`Total fake/unmatched database trades: ${fakeCount}`);

    // Find real trades that don't exist in our database (missing trades)
    console.log("\n=== Checking for Polymarket trades not in Database (Missing) ===");
    let missingCount = 0;
    for (const rt of realTrades) {
        const rtTx = rt.transactionHash || rt.id || '';
        const existsInDb = dbTrades.some((dbt: any) => {
            if (dbt.clob_trade_id === rtTx) return true;

            const isSameCondition = (rt.conditionId || rt.market || '').toLowerCase() === dbt.condition_id.toLowerCase();
            const isSameSide = (rt.side || 'BUY').toUpperCase() === dbt.side;
            const rtOutcome = (rt.outcomeIndex === 0 || String(rt.outcome).toUpperCase() === 'YES' || String(rt.outcome).toUpperCase() === 'UP') ? 'UP' : 'DOWN';
            const isSameOutcome = rtOutcome === dbt.outcome;
            const isSameSize = Math.abs(parseFloat(rt.size || '0') - parseFloat(dbt.shares)) < 0.001;
            const isClosePrice = Math.abs(parseFloat(rt.price || '0') - parseFloat(dbt.price)) < 0.05;

            return isSameCondition && isSameSide && isSameOutcome && isSameSize && isClosePrice;
        });

        if (!existsInDb) {
            console.log(`Missing trade: TX=${rtTx} | Side=${rt.side} | Condition=${rt.conditionId || rt.market} | Size=${rt.size} | Price=${rt.price} | Created At=${rt.create_time || rt.timestamp}`);
            missingCount++;
        }
    }
    console.log(`Total missing trades from database: ${missingCount}`);
}

run();
