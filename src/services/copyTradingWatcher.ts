/**
 * copyTradingWatcher.ts
 * 
 * Near-instant copy trade detection for external Polymarket trades.
 * 
 * Polls Polymarket Data API every 10 seconds ONLY for lead traders
 * who have allow_copy_trading = true AND have active copiers.
 * 
 * Uses the CLOB API keys stored per-user to subscribe to the
 * Polymarket user WebSocket channel for real-time trade events.
 * 
 * Deduplication: tracks processed trade IDs in-memory + checks
 * copy_trade_logs in Supabase (survives restarts).
 */

import WebSocket from 'ws';
import { db } from '../db/client';
import { polymarketRelayerService } from '../services/relayer';
import { polymarketService, customHttpsAgent } from '../services/polymarket';
import { CopyTradingService } from '../services/copy-trading';

const POLY_WS_USER_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/user';
const RECONNECT_DELAY_MS = 5000;
const REFRESH_LEADS_INTERVAL_MS = 5 * 60 * 1000; // Re-check lead list every 5 mins

// In-memory set: tracks trade IDs we've already processed (cleared on restart, Supabase is truth)
const processedTradeIds = new Set<string>();

interface LeadSubscription {
    userId: string;
    telegramId: number;
    username: string;
    walletIndex: number;
    proxyAddress: string;
    apiKey: string | null;
    secret: string | null;
    passphrase: string | null;
    ws: WebSocket | null;
    reconnecting: boolean;
    pingInterval: ReturnType<typeof setInterval> | null;
}

// Map of userId → LeadSubscription
const subscriptions = new Map<string, LeadSubscription>();

async function resolveAndSyncLeads(): Promise<void> {
    const supabase = db.getClient();

    // 1. Fetch all leads who allow copy trading
    const { data: statsList } = await supabase
        .from('prediction_user_stats')
        .select('user_id, telegram_id, username')
        .eq('allow_copy_trading', true);

    if (!statsList || statsList.length === 0) {
        // Close all existing subscriptions if no leads
        for (const [uid, sub] of subscriptions.entries()) {
            teardownSubscription(sub);
            subscriptions.delete(uid);
        }
        return;
    }

    const activeUserIds = new Set(statsList.map((s: any) => s.user_id));

    // 2. Drop subscriptions for leads who disabled copy trading
    for (const [uid, sub] of subscriptions.entries()) {
        if (!activeUserIds.has(uid)) {
            console.log(`[CopyWatcher] Lead ${sub.username || sub.telegramId} disabled. Closing WS.`);
            teardownSubscription(sub);
            subscriptions.delete(uid);
        }
    }

    // 3. Add new subscriptions for newly eligible leads
    for (const stats of statsList) {
        const userId = stats.user_id;
        if (subscriptions.has(userId)) continue; // Already subscribed

        // Check if anyone is copying this lead
        const { count } = await supabase
            .from('copy_connections')
            .select('*', { count: 'exact', head: true })
            .eq('lead_user_id', userId)
            .eq('active', true);

        if (!count || count === 0) continue;

        // Get user's wallet details + CLOB credentials
        const { data: user, error: userErr } = await supabase
            .from('users')
            .select('id, wallet_index, deposit_wallet_address, polymarket_api_key, polymarket_secret, polymarket_passphrase')
            .eq('id', userId)
            .single();

        if (userErr || !user?.deposit_wallet_address) continue;

        const proxyAddress = await polymarketRelayerService
            .resolveDepositWallet(user.wallet_index, user.deposit_wallet_address)
            .catch(() => null);

        if (!proxyAddress) continue;

        const sub: LeadSubscription = {
            userId,
            telegramId: Number(stats.telegram_id),
            username: stats.username || '',
            walletIndex: user.wallet_index,
            proxyAddress,
            apiKey: user.polymarket_api_key || null,
            secret: user.polymarket_secret || null,
            passphrase: user.polymarket_passphrase || null,
            ws: null,
            reconnecting: false,
            pingInterval: null,
        };

        subscriptions.set(userId, sub);
        connectWebSocket(sub);
    }
}

function teardownSubscription(sub: LeadSubscription): void {
    if (sub.pingInterval) {
        clearInterval(sub.pingInterval);
        sub.pingInterval = null;
    }
    if (sub.ws) {
        try { sub.ws.terminate(); } catch {}
        sub.ws = null;
    }
}

function connectWebSocket(sub: LeadSubscription): void {
    if (sub.reconnecting) return;

    if (!sub.apiKey || !sub.secret || !sub.passphrase) {
        console.log(`[CopyWatcher] Lead ${sub.username || sub.telegramId} has no CLOB API keys yet. Will retry after next lead refresh.`);
        return;
    }

    console.log(`[CopyWatcher] 🔌 Connecting WS for lead ${sub.username || sub.telegramId}`);

    let ws: WebSocket;
    try {
        ws = new WebSocket(POLY_WS_USER_URL, { agent: customHttpsAgent });
    } catch (e: any) {
        console.error(`[CopyWatcher] WS create failed for lead ${sub.telegramId}:`, e.message);
        scheduleReconnect(sub);
        return;
    }

    sub.ws = ws;

    ws.on('open', () => {
        console.log(`[CopyWatcher] ✅ WS open for lead ${sub.username || sub.telegramId}`);

        // Authenticate + subscribe to user trade events
        // Polymarket CLOB WS protocol: send auth message then subscribe
        ws.send(JSON.stringify({
            auth: {
                apiKey: sub.apiKey,
                secret: sub.secret,
                passphrase: sub.passphrase,
            }
        }));

        ws.send(JSON.stringify({
            type: 'subscribe',
            channel: 'user',
            markets: [],  // empty = all markets
        }));

        // Heartbeat — Polymarket closes idle connections after ~30s
        const ping = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            } else {
                clearInterval(ping);
            }
        }, 20 * 1000);

        sub.pingInterval = ping;
        ws.on('close', () => clearInterval(ping));
    });

    ws.on('message', async (raw: any) => {
        try {
            const msg = JSON.parse(raw.toString());
            const events: any[] = Array.isArray(msg) ? msg : [msg];

            for (const event of events) {
                // Polymarket user channel emits 'trade' events
                if (event.type !== 'trade' && event.event_type !== 'TRADE') continue;

                const tradeId = event.id || event.trade_id || event.transaction_hash;
                if (!tradeId) continue;
                if (processedTradeIds.has(tradeId)) continue;

                // Only handle BUY side (entries, not exits)
                const side = (event.side || event.maker_side || 'BUY').toUpperCase();
                if (side !== 'BUY') {
                    processedTradeIds.add(tradeId);
                    continue;
                }

                const rawOutcome = String(event.outcome || event.type_outcome || '').toUpperCase();
                const outcome: 'UP' | 'DOWN' = (rawOutcome === 'YES' || rawOutcome === 'UP') ? 'UP' : 'DOWN';
                const price = parseFloat(event.price ?? event.match_price ?? '0.5');
                const shares = parseFloat(event.size ?? event.matched_amount ?? '0');
                const cost = shares * price;

                if (cost < 0.50) {
                    processedTradeIds.add(tradeId);
                    continue;
                }

                // Check Supabase for deduplication (survives restarts)
                const { data: existing } = await db.getClient()
                    .from('copy_trade_logs')
                    .select('id')
                    .eq('lead_user_id', sub.userId)
                    .eq('clob_trade_id', tradeId)
                    .limit(1);

                if (existing && existing.length > 0) {
                    processedTradeIds.add(tradeId);
                    continue;
                }

                processedTradeIds.add(tradeId);

                console.log(`[CopyWatcher] 🔔 INSTANT trade event for lead ${sub.username || sub.telegramId}: ${side} ${outcome} $${cost.toFixed(2)} (id: ${tradeId})`);

                const tokenId = (event.asset_id || event.token_id || '').toLowerCase();

                CopyTradingService.triggerCopyTrades(
                    sub.telegramId,
                    tokenId,
                    cost,
                    price,
                    outcome,
                    'BUY'
                ).catch((err: any) =>
                    console.error('[CopyWatcher] triggerCopyTrades error:', err.message)
                );
            }
        } catch {
            // Ignore parse errors (pong frames, etc.)
        }
    });

    ws.on('close', (code: number) => {
        console.warn(`[CopyWatcher] WS closed for lead ${sub.username || sub.telegramId} (code: ${code}). Reconnecting...`);
        sub.ws = null;
        if (sub.pingInterval) { clearInterval(sub.pingInterval); sub.pingInterval = null; }
        scheduleReconnect(sub);
    });

    ws.on('error', (err: any) => {
        console.error(`[CopyWatcher] WS error for lead ${sub.username || sub.telegramId}:`, err.message);
        sub.ws?.terminate();
        sub.ws = null;
        if (sub.pingInterval) { clearInterval(sub.pingInterval); sub.pingInterval = null; }
        scheduleReconnect(sub);
    });
}

function scheduleReconnect(sub: LeadSubscription): void {
    if (sub.reconnecting) return;
    sub.reconnecting = true;
    setTimeout(() => {
        sub.reconnecting = false;
        if (subscriptions.has(sub.userId)) {
            connectWebSocket(sub);
        }
    }, RECONNECT_DELAY_MS);
}

export async function startCopyTradingWatcher(): Promise<void> {
    console.log('[CopyWatcher] 🚀 Starting real-time copy trade watcher (Polymarket WS)...');

    await resolveAndSyncLeads().catch(err =>
        console.error('[CopyWatcher] Initial lead sync error:', err.message)
    );

    // Periodically refresh: picks up new leads, refreshes credentials, drops removed ones
    setInterval(async () => {
        await resolveAndSyncLeads().catch(err =>
            console.error('[CopyWatcher] Lead sync refresh error:', err.message)
        );
    }, REFRESH_LEADS_INTERVAL_MS);
}
