import crypto from 'crypto';
import { db } from "../src/db/client";
import { polymarketService } from "../src/services/polymarket";
import { polymarketRelayerService } from "../src/services/relayer";
import { resolvePredictionTrades } from "../src/jobs/resolvePredictionTrades";

async function main() {
    const supabase = db.getClient();

    console.log("🧹 Clearing existing trade tables...");
    await supabase.from("prediction_trades").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("prediction_user_stats").delete().neq("user_id", "00000000-0000-0000-0000-000000000000");

    console.log("🔄 Fetching all active proxy users...");
    const { data: users } = await supabase
        .from('users')
        .select('id, telegram_id, username, wallet_index, deposit_wallet_address')
        .not('wallet_index', 'is', null)
        .not('deposit_wallet_address', 'is', null)
        .not('polymarket_api_key', 'is', null);

    if (!users || users.length === 0) {
        console.log("No active users with Polymarket API keys to sync.");
        return;
    }

    console.log(`🔄 Syncing trades for ${users.length} users with correct outcomes...`);
    let totalInserted = 0;
    for (const user of users) {
        try {
            const proxyAddress = await polymarketRelayerService
                .resolveDepositWallet(user.wallet_index, user.deposit_wallet_address)
                .catch(() => null);
            if (!proxyAddress) continue;

            const rawTrades = await polymarketService.getTradesForProxy(proxyAddress).catch(() => []);
            if (!rawTrades || rawTrades.length === 0) continue;

            const rows = rawTrades.map((t: any) => {
                const assetLc = (t.asset_id || '').toLowerCase();
                const rawOutcome = String(t.outcome || '').toUpperCase();
                const outcome = (rawOutcome === 'YES' || rawOutcome === 'UP' || t.outcomeIndex === 0) ? 'UP' : 'DOWN';
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
                    clob_trade_id: t.id ?? t.trade_id ?? t.transactionHash ?? crypto.createHash('md5').update(`${proxyAddress}-${t.conditionId || t.market}-${t.side}-${t.price}-${t.size}-${t.timestamp || t.create_time}`).digest('hex'),
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
                console.warn(`Upsert error for user ${user.telegram_id}:`, error.message);
            } else {
                totalInserted += rows.length;
                console.log(`User ${user.telegram_id}: synced ${rows.length} trades`);
            }
        } catch (e: any) {
            console.warn(`Failed for user ${user.telegram_id}:`, e.message);
        }
    }

    console.log(`Synced ${totalInserted} trades. Running resolution...`);
    await resolvePredictionTrades();
    console.log("✅ Reset and re-sync fully completed!");
}

main().catch(console.error);
