import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

const CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const CTF_ABI = [
    'function payoutDenominator(bytes32) view returns (uint256)',
    'function payoutNumerators(bytes32, uint256) view returns (uint256)',
];
import { ethers } from 'ethers';

async function getConditionResolution(conditionId: string): Promise<{ num0: number; num1: number; denominator: number } | null> {
    try {
        const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com');
        const ctf = new ethers.Contract(CTF_ADDRESS, CTF_ABI, provider);
        const denominator = await ctf.payoutDenominator(conditionId);
        if (BigInt(denominator) === 0n) return null; // Not resolved yet
        const [num0, num1] = await Promise.all([
            ctf.payoutNumerators(conditionId, 0),
            ctf.payoutNumerators(conditionId, 1),
        ]);
        return {
            num0: Number(num0),
            num1: Number(num1),
            denominator: Number(denominator),
        };
    } catch {
        return null;
    }
}

async function run() {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!);
    
    // Find shijas user
    const { data: user, error: userErr } = await supabase
        .from('users')
        .select('*')
        .or('username.ilike.shijas,first_name.ilike.shijas')
        .limit(1);

    if (userErr || !user || user.length === 0) {
        console.error("User shijas not found:", userErr);
        return;
    }

    const u = user[0];
    console.log("User details:", {
        id: u.id,
        telegram_id: u.telegram_id,
        username: u.username,
        first_name: u.first_name
    });

    // Get trades
    const { data: trades, error: tradesErr } = await supabase
        .from('prediction_trades')
        .select('*')
        .eq('telegram_id', u.telegram_id)
        .order('traded_at', { ascending: true });

    if (tradesErr || !trades) {
        console.error("Failed to query trades:", tradesErr);
        return;
    }

    console.log(`Total trades found: ${trades.length}`);

    // Group trades by condition_id
    const conditionMap: Record<string, {
        buyShares: number;
        buyCost: number;
        sellShares: number;
        sellPayout: number;
        outcomeIndex: number; // 0 for UP, 1 for DOWN
        trades: any[];
    }> = {};

    for (const t of trades) {
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

    console.log("\n=== Correct PnL Calculation ===");
    let totalRealizedPnl = 0;
    
    for (const [cid, data] of Object.entries(conditionMap)) {
        // Find if this is resolved/closed
        const resolvedTrade = data.trades.find(t => t.resolved);
        let payoutFraction = null;

        if (resolvedTrade) {
            const resolution = resolvedTrade.resolution;
            // Determine payout fraction from resolution
            payoutFraction = resolvedTrade.resolution === 'WIN' ? 1 : resolvedTrade.resolution === 'LOSS' ? 0 : 0.5;
        } else {
            // Check on chain
            const res = await getConditionResolution(cid);
            if (res) {
                const num = data.outcomeIndex === 0 ? res.num0 : res.num1;
                payoutFraction = num / res.denominator;
            }
        }

        const remainingShares = Math.max(0, data.buyShares - data.sellShares);
        
        // If resolved OR we sold everything (remaining shares is 0)
        if (payoutFraction !== null || remainingShares <= 0.001) {
            const resolvedFraction = payoutFraction ?? 0;
            const remainingPayout = remainingShares * resolvedFraction;
            const actualPnl = data.sellPayout + remainingPayout - data.buyCost;
            
            console.log(`Condition: ${cid.slice(0, 12)}... | Buy Cost: $${data.buyCost.toFixed(2)} (${data.buyShares.toFixed(2)} sh) | Sell Payout: $${data.sellPayout.toFixed(2)} (${data.sellShares.toFixed(2)} sh) | Rem: ${remainingShares.toFixed(2)} sh (fraction=${resolvedFraction}) | PnL: $${actualPnl.toFixed(2)}`);
            totalRealizedPnl += actualPnl;
        } else {
            console.log(`Condition (OPEN): ${cid.slice(0, 12)}... | Buy Cost: $${data.buyCost.toFixed(2)} (${data.buyShares.toFixed(2)} sh) | Sell Payout: $${data.sellPayout.toFixed(2)} (${data.sellShares.toFixed(2)} sh) | Rem: ${remainingShares.toFixed(2)} sh`);
        }
    }

    console.log(`\nFinal Correct Realized PnL: $${totalRealizedPnl.toFixed(2)}`);
}

run();
