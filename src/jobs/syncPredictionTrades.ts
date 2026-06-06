/**
 * syncPredictionTrades.ts
 * Backfills prediction_trades from Polymarket CLOB for all users who have a proxy.
 * Run once on deploy, then daily via cron.
 */
import { db } from '../db/client';
import { polymarketService } from '../services/polymarket';
import { polymarketRelayerService } from '../services/relayer';

export async function syncPredictionTrades() {
    console.log('[SyncTrades] Starting backfill...');

    const supabase = db.getClient();

    // Optimize: Fetch only users who have active prediction stats (placed at least 1 trade)
    const { data: activeStats } = await supabase
        .from('prediction_user_stats')
        .select('user_id');

    const activeUserIds = (activeStats || []).map(s => s.user_id);
    if (activeUserIds.length === 0) {
        console.log('[SyncTrades] No active prediction users to sync.');
        return;
    }

    // Fetch details for active users only
    const { data: users } = await supabase
        .from('users')
        .select('id, telegram_id, username, wallet_index, deposit_wallet_address')
        .in('id', activeUserIds)
        .not('wallet_index', 'is', null)
        .not('deposit_wallet_address', 'is', null);

    if (!users || users.length === 0) {
        console.log('[SyncTrades] No active users matched proxy details.');
        return;
    }

    let totalInserted = 0;
    for (const user of users) {
        try {
            const proxyAddress = await polymarketRelayerService
                .resolveDepositWallet(user.wallet_index, user.deposit_wallet_address)
                .catch(() => null);
            if (!proxyAddress) continue;

            const rawTrades = await polymarketService.getTradesForProxy(proxyAddress).catch(() => []);
            if (!rawTrades || rawTrades.length === 0) continue;

            const market = await polymarketService.getActiveBtcMarket().catch(() => null);
            const yesLc = market?.yesTokenId?.toLowerCase() ?? '';
            const noLc = market?.noTokenId?.toLowerCase() ?? '';

            const rows = rawTrades.map((t: any) => {
                const assetLc = (t.asset_id || '').toLowerCase();
                const outcome = assetLc === yesLc ? 'UP' : assetLc === noLc ? 'DOWN' : 'UP';
                const side = (t.side || 'BUY').toUpperCase();
                const price = parseFloat(t.price ?? '0');
                const shares = parseFloat(t.size ?? '0');
                const cost = shares * price;

                let tradedAt = new Date().toISOString();
                if (t.create_time) tradedAt = new Date(t.create_time).toISOString();
                else if (t.timestamp) {
                    const raw = t.timestamp.toString();
                    tradedAt = raw.includes('T') ? raw : new Date(parseInt(raw) * 1000).toISOString();
                }

                return {
                    user_id: user.id,
                    telegram_id: user.telegram_id,
                    username: user.username,
                    proxy_address: proxyAddress,
                    clob_trade_id: t.id ?? t.trade_id ?? null,
                    condition_id: t.market ?? t.conditionId ?? '',
                    token_id: assetLc,
                    outcome,
                    side,
                    price,
                    shares,
                    cost_usdc: cost,
                    traded_at: tradedAt,
                };
            }).filter((r: any) => r.condition_id && r.shares > 0);

            if (rows.length === 0) continue;

            const { error } = await supabase
                .from('prediction_trades')
                .upsert(rows, { onConflict: 'clob_trade_id', ignoreDuplicates: true });

            if (error) {
                console.warn(`[SyncTrades] Upsert error for user ${user.telegram_id}:`, error.message);
            } else {
                totalInserted += rows.length;
                console.log(`[SyncTrades] User ${user.telegram_id}: synced ${rows.length} trades`);
            }

            // Rate-limit: don't hammer the CLOB API
            await new Promise(r => setTimeout(r, 300));
        } catch (e: any) {
            console.warn(`[SyncTrades] Failed for user ${user.telegram_id}:`, e.message);
        }
    }

    console.log(`[SyncTrades] Done. Inserted/updated ${totalInserted} trades across ${users.length} users.`);
}
