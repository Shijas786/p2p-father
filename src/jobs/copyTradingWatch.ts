/**
 * copyTradingWatch.ts
 * 
 * Polls Polymarket CLOB every 30s for lead traders who have allow_copy_trading = true.
 * When a new trade is detected (not already in copy_trade_logs), fires triggerCopyTrades.
 * 
 * This is the fallback for trades placed directly on Polymarket.com instead of
 * through the P2PFather miniapp. The miniapp's /predictions/bet already fires
 * triggerCopyTrades instantly — this job handles external trades.
 */

import crypto from 'crypto';
import { db } from '../db/client';
import { polymarketService } from '../services/polymarket';
import { polymarketRelayerService } from '../services/relayer';
import { CopyTradingService } from '../services/copy-trading';

// In-memory set of clob_trade_ids already processed for copy trading this session.
// Supabase copy_trade_logs is the authoritative source (survives restarts).
const processedTradeIds = new Set<string>();

export async function runCopyTradingWatch(): Promise<void> {
    const supabase = db.getClient();

    try {
        // 1. Fetch all lead traders who allow copy trading
        const { data: leads, error: leadsErr } = await supabase
            .from('prediction_user_stats')
            .select('user_id, telegram_id, username')
            .eq('allow_copy_trading', true);

        if (leadsErr || !leads || leads.length === 0) return;

        for (const lead of leads) {
            try {
                // 2. Check if anyone is actually copying this lead (skip if no copiers)
                const { count } = await supabase
                    .from('copy_connections')
                    .select('*', { count: 'exact', head: true })
                    .eq('lead_user_id', lead.user_id)
                    .eq('active', true);

                if (!count || count === 0) continue;

                // 3. Get user wallet details
                const { data: user, error: userErr } = await supabase
                    .from('users')
                    .select('id, telegram_id, wallet_index, deposit_wallet_address')
                    .eq('id', lead.user_id)
                    .single();

                if (userErr || !user || user.wallet_index === null || !user.deposit_wallet_address) continue;

                // 4. Fetch latest trades from Polymarket CLOB
                const proxyAddress = await polymarketRelayerService
                    .resolveDepositWallet(user.wallet_index, user.deposit_wallet_address)
                    .catch(() => null);

                if (!proxyAddress) continue;

                const rawTrades = await polymarketService.getTradesForProxy(proxyAddress).catch(() => []);
                if (!rawTrades || rawTrades.length === 0) continue;

                // 5. Process only BUY trades from the last 2 minutes (avoid replaying old history)
                const TWO_MIN_AGO = Date.now() - 2 * 60 * 1000;

                for (const t of rawTrades) {
                    const side = (t.side || 'BUY').toUpperCase();
                    if (side !== 'BUY') continue; // Only copy BUY entries

                    // Build stable trade ID
                    const tradeId = t.id ?? t.trade_id ?? t.transactionHash ??
                        crypto.createHash('md5')
                            .update(`${proxyAddress}-${t.conditionId || t.market}-${t.side}-${t.price}-${t.size}-${t.timestamp || t.create_time}`)
                            .digest('hex');

                    // Skip if already processed this session
                    if (processedTradeIds.has(tradeId)) continue;

                    // Check trade timestamp — only act on recent trades
                    let tradedAtMs = 0;
                    if (t.create_time) {
                        tradedAtMs = new Date(t.create_time).getTime();
                    } else if (t.timestamp) {
                        const raw = t.timestamp.toString();
                        tradedAtMs = raw.includes('T')
                            ? new Date(raw).getTime()
                            : parseInt(raw) * 1000;
                    }

                    if (tradedAtMs > 0 && tradedAtMs < TWO_MIN_AGO) {
                        // Too old — mark as processed to skip in future runs
                        processedTradeIds.add(tradeId);
                        continue;
                    }

                    // 6. Check copy_trade_logs — has this exact clob_trade_id already been copy-traded?
                    const { data: existingLogs } = await supabase
                        .from('copy_trade_logs')
                        .select('id')
                        .eq('lead_user_id', lead.user_id)
                        .eq('clob_trade_id', tradeId)
                        .limit(1);

                    if (existingLogs && existingLogs.length > 0) {
                        processedTradeIds.add(tradeId);
                        continue;
                    }

                    // 7. New trade detected! Fire copy trades
                    const rawOutcome = String(t.outcome || '').toUpperCase();
                    const outcome = (rawOutcome === 'YES' || rawOutcome === 'UP' || t.outcomeIndex === 0) ? 'UP' : 'DOWN';
                    const price = parseFloat(t.price ?? '0.5');
                    const shares = parseFloat(t.size ?? '0');
                    const cost = shares * price;

                    if (cost < 0.50) {
                        processedTradeIds.add(tradeId);
                        continue; // Ignore dust trades
                    }

                    console.log(`[CopyWatch] 🆕 New external trade detected for lead ${lead.username || lead.telegram_id}: ${side} ${outcome}, $${cost.toFixed(2)}, tradeId=${tradeId}`);

                    // Mark processed before firing to prevent duplicate triggers if job overlaps
                    processedTradeIds.add(tradeId);

                    // Also upsert into prediction_trades so history is complete
                    try {
                        const assetLc = (t.asset_id || '').toLowerCase();
                        await supabase.from('prediction_trades').upsert({
                            user_id: user.id,
                            telegram_id: user.telegram_id,
                            proxy_address: proxyAddress,
                            clob_trade_id: tradeId,
                            condition_id: t.market ?? t.conditionId ?? '',
                            token_id: assetLc,
                            outcome,
                            side,
                            price,
                            shares,
                            cost_usdc: cost,
                            traded_at: t.create_time
                                ? new Date(t.create_time).toISOString()
                                : tradedAtMs > 0 ? new Date(tradedAtMs).toISOString() : new Date().toISOString(),
                        }, { onConflict: 'clob_trade_id', ignoreDuplicates: true });
                    } catch (insertErr: any) {
                        console.warn('[CopyWatch] Failed to upsert trade record:', insertErr.message);
                    }

                    // Fire copy trades (async, non-blocking)
                    CopyTradingService.triggerCopyTrades(
                        Number(user.telegram_id),
                        (t.asset_id || '').toLowerCase(),
                        cost,
                        price,
                        outcome,
                        'BUY'
                    ).catch((err: any) =>
                        console.error('[CopyWatch] triggerCopyTrades error:', err.message)
                    );
                }
            } catch (leadErr: any) {
                console.warn(`[CopyWatch] Error processing lead ${lead.telegram_id}:`, leadErr.message);
            }
        }
    } catch (err: any) {
        console.error('[CopyWatch] Fatal error:', err.message);
    }
}
