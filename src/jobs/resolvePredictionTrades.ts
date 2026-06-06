/**
 * resolvePredictionTrades.ts
 * Runs every 10 minutes. Checks unresolved prediction_trades against on-chain resolution.
 * Updates resolution, pnl, and prediction_user_stats. Flags WIN rows for future claim.
 */
import { db } from '../db/client';
import { ethers } from 'ethers';

const CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const CTF_ABI = [
    'function payoutDenominator(bytes32) view returns (uint256)',
    'function payoutNumerators(bytes32, uint256) view returns (uint256)',
];

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

export async function resolvePredictionTrades() {
    const supabase = db.getClient();
    console.log('[ResolveTrades] Checking for unresolved trades...');

    // Fetch unresolved BUY trades (only BUY trades can win/lose)
    const { data: unresolved } = await supabase
        .from('prediction_trades')
        .select('*')
        .eq('resolved', false)
        .eq('side', 'BUY')
        .limit(200);

    if (!unresolved || unresolved.length === 0) {
        console.log('[ResolveTrades] Nothing to resolve.');
        return;
    }

    // Group by condition_id to avoid duplicate on-chain calls
    const conditionMap = new Map<string, any>();
    for (const trade of unresolved) {
        if (!conditionMap.has(trade.condition_id)) {
            conditionMap.set(trade.condition_id, null);
        }
    }

    // Resolve each unique condition
    for (const [conditionId] of conditionMap) {
        const result = await getConditionResolution(conditionId);
        conditionMap.set(conditionId, result);
        await new Promise(r => setTimeout(r, 200)); // rate limit
    }

    let updatedCount = 0;
    for (const trade of unresolved) {
        const res = conditionMap.get(trade.condition_id);
        if (!res) continue; // Not resolved yet on-chain

        // outcome 'UP' = YES = outcomeIndex 0, 'DOWN' = NO = outcomeIndex 1
        const outcomeIndex = trade.outcome === 'UP' ? 0 : 1;
        const num = outcomeIndex === 0 ? res.num0 : res.num1;
        const payoutFraction = num / res.denominator;

        const payoutUsdc = parseFloat(trade.shares) * payoutFraction;
        const pnlUsdc = payoutUsdc - parseFloat(trade.cost_usdc);
        const resolution = payoutFraction >= 0.99 ? 'WIN' : payoutFraction <= 0.01 ? 'LOSS' : 'PUSH';

        const { error } = await supabase
            .from('prediction_trades')
            .update({
                resolved: true,
                resolution,
                payout_usdc: payoutUsdc,
                pnl_usdc: pnlUsdc,
                resolved_at: new Date().toISOString(),
                // claimed stays FALSE — admin can trigger redeemPositions() manually or via future auto-claim
            })
            .eq('id', trade.id);

        if (!error) {
            updatedCount++;

            // Update user stats
            try {
                const { error: rpcErr } = await supabase.rpc('update_prediction_user_stats', {
                    p_user_id: trade.user_id,
                    p_telegram_id: trade.telegram_id,
                    p_username: trade.username,
                    p_proxy_address: trade.proxy_address,
                    p_is_win: resolution === 'WIN',
                    p_is_loss: resolution === 'LOSS',
                    p_payout: payoutUsdc,
                    p_pending_delta: resolution === 'WIN' ? 1 : 0,
                });
                if (rpcErr) {
                    console.warn('[ResolveTrades] Stats RPC error:', rpcErr.message);
                }
            } catch (e: any) {
                console.warn('[ResolveTrades] Stats RPC exception:', e.message);
            }

            // Clear predictions cache so the new resolved status is instantly loaded
            try {
                const { polymarketService } = await import('../services/polymarket');
                await polymarketService.clearUserPredictionsCache(trade.telegram_id);
            } catch (cacheErr: any) {
                console.warn('[ResolveTrades] Failed to clear user cache:', cacheErr.message);
            }
        }
    }

    console.log(`[ResolveTrades] Resolved ${updatedCount} trades.`);
}
