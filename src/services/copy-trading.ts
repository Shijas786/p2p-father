import { db } from "../db/client";
import { polymarketService } from "./polymarket";
import { polymarketRelayerService } from "./relayer";
import { bot } from "../bot";

export class CopyTradingService {
    /**
     * Replicates a lead trader's prediction for all active copiers in the background.
     */
    static async triggerCopyTrades(
        leadTelegramId: number,
        tokenId: string,
        leadAmount: number,
        price: number,
        outcome: "UP" | "DOWN",
        side: "BUY" | "SELL" = "BUY"
    ): Promise<void> {
        // Run in the background without blocking the lead trader
        setTimeout(async () => {
            try {
                console.log(`[Copy Trading] Processing copy trades for lead ${leadTelegramId}. Trade: ${side} ${outcome} token ${tokenId}`);

                const supabase = db.getClient();

                // 1. Resolve lead user ID and check if they allow copy trading
                const { data: leadStats, error: statsErr } = await supabase
                    .from("prediction_user_stats")
                    .select("user_id, username, allow_copy_trading")
                    .eq("telegram_id", leadTelegramId)
                    .single();

                if (statsErr || !leadStats) {
                    console.warn(`[Copy Trading] Could not find stats for lead ${leadTelegramId}:`, statsErr?.message);
                    return;
                }

                if (!leadStats.allow_copy_trading) {
                    console.log(`[Copy Trading] Lead ${leadStats.username || leadTelegramId} has copy trading disabled.`);
                    return;
                }

                // 2. Fetch all active copiers for this lead user
                const { data: connections, error: connErr } = await supabase
                    .from("copy_connections")
                    .select("*")
                    .eq("lead_user_id", leadStats.user_id)
                    .eq("active", true);

                if (connErr || !connections || connections.length === 0) {
                    console.log(`[Copy Trading] No active copiers for lead ${leadStats.username || leadTelegramId}`);
                    return;
                }

                console.log(`[Copy Trading] Found ${connections.length} active copiers for lead ${leadStats.username || leadTelegramId}`);

                // 3. Execute trades for each copier in parallel (with safe errors)
                await Promise.all(connections.map(async (conn) => {
                    let logStatus: "SUCCESS" | "FAILED" = "FAILED";
                    let logError: string | null = null;
                    let copierAmount = 0;
                    let copierUser: any = null;

                    try {
                        // Resolve copier details
                        const { data: user, error: userErr } = await supabase
                            .from("users")
                            .select("*")
                            .eq("id", conn.copier_user_id)
                            .single();

                        if (userErr || !user) {
                            throw new Error(`Copier user record not found: ${userErr?.message || 'unknown'}`);
                        }
                        copierUser = user;

                        // Calculate amount to wager
                        if (conn.amount_type === "FIXED") {
                            copierAmount = parseFloat(conn.amount_value);
                        } else {
                            copierAmount = leadAmount * parseFloat(conn.amount_value);
                        }

                        // Polymarket CLOB minimum constraint check (min $1 for market order)
                        if (copierAmount < 1) {
                            throw new Error(`Calculated copy amount ($${copierAmount.toFixed(2)}) is below the Polymarket minimum of $1.00`);
                        }

                        // Resolve copier balance
                        const balanceStr = await polymarketRelayerService.getPusdBalance(user.wallet_index).catch(() => "0");
                        const copierBalance = parseFloat(balanceStr) || 0;

                        if (copierBalance < copierAmount) {
                            throw new Error(`Insufficient cash balance. Required: $${copierAmount.toFixed(2)}, Available: $${copierBalance.toFixed(2)}`);
                        }

                        // Place prediction order
                        console.log(`[Copy Trading] Replicating bet for copier ${user.username || user.telegram_id}. Amount: $${copierAmount}`);
                        const res = await polymarketService.placeBet(
                            user.wallet_index,
                            tokenId,
                            copierAmount,
                            price,
                            side,
                            "MARKET"
                        );

                        if (!res || !res.success) {
                            throw new Error(res?.error || "Order placement failed on Polymarket CLOB");
                        }

                        logStatus = "SUCCESS";
                        console.log(`[Copy Trading] Replicated bet successfully for copier ${user.username || user.telegram_id}`);

                        // Clear cache for copier to update UI states
                        const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index, user.deposit_wallet_address);
                        if (proxyAddress) {
                            polymarketService.clearUserCache(proxyAddress);
                        }
                        await polymarketService.clearUserPredictionsCache(user.telegram_id);

                        // Notify copier on Telegram
                        try {
                            const leadName = leadStats.username ? `@${leadStats.username}` : `Trader ${leadTelegramId}`;
                            const msg = `⚡ <b>Copy Trade Executed!</b>\n\nReplicated entry from <b>${leadName}</b>:\n• Action: <b>${side} ${outcome}</b>\n• Amount: <b>$${copierAmount.toFixed(2)} USDC</b>`;
                            await bot.api.sendMessage(user.telegram_id, msg, { parse_mode: "HTML" }).catch(() => {});
                        } catch (botErr) {
                            console.warn("[Copy Trading] Failed to send telegram notification:", botErr);
                        }

                    } catch (err: any) {
                        logError = err.message || "Unknown copy execution error";
                        logStatus = "FAILED";
                        console.error(`[Copy Trading] Failed for copier ${conn.copier_telegram_id}:`, logError);

                        // Notify copier of failed replication (important for trust!)
                        if (copierUser) {
                            try {
                                const leadName = leadStats.username ? `@${leadStats.username}` : `Trader ${leadTelegramId}`;
                                const msg = `⚠️ <b>Copy Trade Failed</b>\n\nCould not replicate entry from <b>${leadName}</b>:\n• Reason: <code>${logError}</code>`;
                                await bot.api.sendMessage(copierUser.telegram_id, msg, { parse_mode: "HTML" }).catch(() => {});
                            } catch {}
                        }
                    } finally {
                        // Log execution outcome in database audit table
                        try {
                            await supabase.from("copy_trade_logs").insert({
                                copier_user_id: conn.copier_user_id,
                                lead_user_id: leadStats.user_id,
                                status: logStatus,
                                error_message: logError,
                                amount_wagered: copierAmount,
                            });
                        } catch (logDbErr: any) {
                            console.warn("[Copy Trading] Failed to write copy_trade_logs row:", logDbErr.message);
                        }
                    }
                }));

            } catch (err: any) {
                console.error("[Copy Trading] Fatal background orchestrator error:", err.message);
            }
        }, 100);
    }
}
