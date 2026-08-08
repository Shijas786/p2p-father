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

    // Identify fake/unmatched trades
    const fakeIdsToDelete: string[] = [];
    
    for (const dbt of dbTrades) {
        const existsInReal = realTrades.some((rt: any) => {
            const rtTx = rt.transactionHash || rt.id || '';
            const dbtTx = dbt.clob_trade_id;
            if (dbtTx === rtTx) return true;

            const isSameCondition = (rt.conditionId || rt.market || '').toLowerCase() === dbt.condition_id.toLowerCase();
            const isSameSide = (rt.side || 'BUY').toUpperCase() === dbt.side;
            const rtOutcome = (rt.outcomeIndex === 0 || String(rt.outcome).toUpperCase() === 'YES' || String(rt.outcome).toUpperCase() === 'UP') ? 'UP' : 'DOWN';
            const isSameOutcome = rtOutcome === dbt.outcome;
            const isSameSize = Math.abs(parseFloat(rt.size || '0') - parseFloat(dbt.shares)) < 0.001;
            const isClosePrice = Math.abs(parseFloat(rt.price || '0') - parseFloat(dbt.price)) < 0.05;

            return isSameCondition && isSameSide && isSameOutcome && isSameSize && isClosePrice;
        });

        if (!existsInReal) {
            fakeIdsToDelete.push(dbt.id);
        }
    }

    console.log(`Found ${fakeIdsToDelete.length} fake trades to delete.`);

    if (fakeIdsToDelete.length > 0) {
        // Delete in batches of 100
        for (let i = 0; i < fakeIdsToDelete.length; i += 100) {
            const batch = fakeIdsToDelete.slice(i, i + 100);
            const { error: delErr } = await supabase
                .from('prediction_trades')
                .delete()
                .in('id', batch);
            if (delErr) {
                console.error("Delete batch failed:", delErr);
            } else {
                console.log(`Deleted batch of ${batch.length} fake trades.`);
            }
        }
    }

    // Fetch updated db trades
    const { data: cleanDbTrades } = await supabase
        .from('prediction_trades')
        .select('*')
        .eq('telegram_id', 123456789)
        .order('traded_at', { ascending: true });

    console.log(`Database now contains ${cleanDbTrades?.length} trades for user.`);

    // Recalculate actual PnL
    const conditionMap: Record<string, {
        buyShares: number;
        buyCost: number;
        sellShares: number;
        sellPayout: number;
        outcomeIndex: number;
        trades: any[];
    }> = {};

    for (const t of cleanDbTrades || []) {
        const cid = t.condition_id;
        if (!conditionMap[cid]) {
            conditionMap[cid] = {
                buyShares: 0,
                buyCost: 0,
                sellShares: 0,
                sellPayout: 0,
                outcomeIndex: t.outcome === 'UP' ? 0 : 1,
                trades: []
            };
        }
        conditionMap[cid].trades.push(t);
        const shares = parseFloat(t.shares || '0');
        const cost = parseFloat(t.cost_usdc || '0');
        if (t.side === 'BUY') {
            conditionMap[cid].buyShares += shares;
            conditionMap[cid].buyCost += cost;
        } else if (t.side === 'SELL') {
            conditionMap[cid].sellShares += shares;
            conditionMap[cid].sellPayout += cost;
        }
    }

    const { getConditionResolution } = await import("./query_p2pfather_supportrades");

    let totalRealizedPnl = 0;
    
    for (const [cid, data] of Object.entries(conditionMap)) {
        const resolvedTrade = data.trades.find(t => t.resolved);
        let payoutFraction = null;

        if (resolvedTrade) {
            payoutFraction = resolvedTrade.resolution === 'WIN' ? 1 : resolvedTrade.resolution === 'LOSS' ? 0 : 0.5;
        } else {
            const res = await getConditionResolution(cid);
            if (res) {
                const num = data.outcomeIndex === 0 ? res.num0 : res.num1;
                payoutFraction = num / res.denominator;
            }
        }

        const remainingShares = Math.max(0, data.buyShares - data.sellShares);
        
        if (payoutFraction !== null || remainingShares <= 0.001) {
            const resolvedFraction = payoutFraction ?? 0;
            const remainingPayout = remainingShares * resolvedFraction;
            const actualPnl = data.sellPayout + remainingPayout - data.buyCost;
            totalRealizedPnl += actualPnl;
        }
    }

    console.log(`\nRecalculated Realized PnL from CLEAN trades list: $${totalRealizedPnl.toFixed(2)}`);

    // Let's also recalculate what the database triggers think the PnL is
    const resolvedBuyTrades = (cleanDbTrades || []).filter(t => t.side === 'BUY' && t.resolved);
    let dbMethodPnL = 0;
    for (const t of resolvedBuyTrades) {
        const shares = parseFloat(t.shares);
        const cost = parseFloat(t.cost_usdc);
        const payout = t.payout_usdc ? parseFloat(t.payout_usdc) : 0;
        dbMethodPnL += (payout - cost);
    }
    console.log(`DB Method PnL (sum of resolved BUY trades): $${dbMethodPnL.toFixed(2)}`);
}

run();
