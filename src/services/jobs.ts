import { db } from "../db/client";
import { env } from "../config/env";
import { deleteAdBroadcasts } from "../bot";
import { ethers } from "ethers";

export function startExpiryJob() {
    console.log("⏰ Starting Ad Expiry Job...");

    // Check every 1 minute
    setInterval(async () => {
        try {
            const now = new Date().toISOString();
            const client = (db as any).getClient(); 
            
            // Get ads that ARE about to expire
            const { data: toExpire, error: fetchError } = await client
                .from("orders")
                .select("id")
                .eq("status", "active")
                .lt("expires_at", now);

            if (fetchError) throw fetchError;

            if (toExpire && toExpire.length > 0) {
                const ids = toExpire.map((o: any) => o.id);
                
                // Update status in bulk
                const { error: updateError } = await client
                    .from("orders")
                    .update({ status: "expired", updated_at: now })
                    .in("id", ids);

                if (updateError) throw updateError;

                console.log(`[JOB] Auto-expired ${ids.length} ads. Cleaning up broadcasts...`);

                // Trigger cleanup for each
                for (const id of ids) {
                    deleteAdBroadcasts(id).catch(err => {
                        console.error(`[JOB] Failed to cleanup broadcasts for order ${id}:`, err);
                    });
                }
            }

            // ═══ ROBUSTNESS: Cleanup Orphaned Broadcasts ═══
            // Find any ads that are NOT 'active' but still have broadcast records in the DB
            const { data: orphaned, error: orphanError } = await client
                .from("ad_broadcasts")
                .select("order_id")
                .limit(20); // Process in small batches

            if (!orphanError && orphaned && orphaned.length > 0) {
                const uniqueOrderIds = Array.from(new Set(orphaned.map((b: any) => b.order_id)));
                for (const orderId of uniqueOrderIds) {
                    const { data: order } = await client
                        .from("orders")
                        .select("status")
                        .eq("id", orderId)
                        .single();
                    
                    // If order is gone or not active, clean up
                    if (!order || order.status !== 'active') {
                        console.log(`[JOB] Cleaning up orphaned broadcasts for order ${orderId} (Status: ${order?.status || 'deleted'})`);
                        deleteAdBroadcasts(orderId as string).catch(() => {});
                    }
                }
            }

            // ⏰ Update live countdown timer for active ads
            const { data: activeAds, error: activeError } = await client
                .from("orders")
                .select("*, users(username, first_name)")
                .eq("status", "active")
                .not("expires_at", "is", null);

            if (!activeError && activeAds && activeAds.length > 0) {
                const { updateAdBroadcasts } = await import("../bot");
                for (const order of activeAds) {
                    const user = order.users;
                    if (user) {
                        updateAdBroadcasts(order, user).catch(() => {});
                    }
                }
            }
        } catch (err) {
            console.error("[JOB] Expiry job error:", err);
        }
    }, 60 * 1000); // 1 minute
}

export function startLiquiditySyncJob(escrowService: any) {
    console.log("🛡️ Starting Liquidity Sync Job...");

    // Check every 5 minutes (less frequent than expiry)
    setInterval(async () => {
        try {
            const client = (db as any).getClient();

            // 1. Get all users who have active sell ads
            const { data: activeSellers, error } = await client
                .from("orders")
                .select("user_id")
                .eq("status", "active")
                .eq("type", "sell");

            if (error || !activeSellers) return;

            const uniqueSellerIds = Array.from(new Set(activeSellers.map((s: any) => s.user_id)));

            for (const userId of uniqueSellerIds) {
                const user = await db.getUserById(userId as string);
                if (!user || !user.wallet_address) continue;

                const tokens = ["USDC", "USDT", "BNB"];
                const chains = ["base", "bsc"];

                for (const chain of chains) {
                    for (const token of tokens) {
                        try {
                            // Calculate reserved amount
                            const reserved = await db.getReservedAmount(user.id, token, chain);
                            if (reserved <= 0) continue;

                            // Get physical balance
                            let tokenAddress = "";
                            if (chain === 'bsc') {
                                if (token === 'BNB') {
                                    tokenAddress = "0x0000000000000000000000000000000000000000";
                                } else {
                                    tokenAddress = (token === "USDT") ? "0x55d398326f99059fF775485246999027B3197955" : "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
                                }
                            } else {
                                tokenAddress = (token === "USDT") ? env.USDT_ADDRESS : env.USDC_ADDRESS;
                            }

                            const balanceStr = await escrowService.getVaultBalance(user.wallet_address, tokenAddress, chain);
                            const physicalBalance = parseFloat(balanceStr);

                            if (physicalBalance < reserved) {
                                console.warn(`🚨 User ${user.wallet_address} is over-listed on ${chain} for ${token}! Balance: ${physicalBalance}, Reserved: ${reserved}`);

                                // Logic: Cancel newest ads until reserved <= physicalBalance
                                const { data: ads } = await client
                                    .from("orders")
                                    .select("id, amount, filled_amount")
                                    .eq("user_id", user.id)
                                    .eq("status", "active")
                                    .eq("type", "sell")
                                    .eq("token", token)
                                    .eq("chain", chain)
                                    .order("created_at", { ascending: false });

                                let currentReserved = reserved;
                                if (ads) {
                                    for (const ad of ads) {
                                        if (currentReserved <= physicalBalance) break;

                                        console.log(`[SYNC] Auto-cancelling ad ${ad.id} due to insufficient vault balance.`);
                                        await client.from("orders").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", ad.id);
                                        
                                        // Broadcast cleanup
                                        deleteAdBroadcasts(ad.id).catch(err => {
                                            console.error(`[SYNC] Failed to cleanup broadcasts for auto-cancelled ad ${ad.id}:`, err);
                                        });

                                        currentReserved -= (ad.amount - (ad.filled_amount || 0));
                                    }
                                }
                            }
                        } catch (err) {
                            // Continue to next token/chain
                        }
                    }
                }
            }
        } catch (err) {
            console.error("[JOB] Liquidity sync error:", err);
        }
    }, 5 * 60 * 1000); // 5 minutes
}


export const attemptedRedeems = new Set<string>();
export const redeemAttempts = new Map<string, number>();
export const failedRedeemCounts = new Map<string, number>();
export const resolvedConditionsCache = new Set<string>();
const unresolvedConditionsCheckTime = new Map<string, number>(); // conditionId -> timestamp

// Persistent skip set — loaded from Supabase on each job run, survives server restarts
const persistentSkips = new Set<string>(); // "walletIndex-conditionId" keys

async function loadPersistentSkips(client: any): Promise<void> {
    try {
        const { data, error } = await client
            .from('autoclaim_skips')
            .select('skip_key')
            .eq('status', 'losing_skip');
        if (error || !data) return;
        for (const row of data) {
            persistentSkips.add(row.skip_key);
            attemptedRedeems.add(row.skip_key); // also populate in-memory set
        }
    } catch (e) {
        // Table may not exist yet — safe to ignore, will be created on first skip
    }
}

async function persistLosingSkip(client: any, skipKey: string, conditionId: string, walletIndex: number, reason: string): Promise<void> {
    try {
        await client
            .from('autoclaim_skips')
            .upsert({
                skip_key: skipKey,
                condition_id: conditionId,
                wallet_index: walletIndex,
                status: 'losing_skip',
                reason,
                created_at: new Date().toISOString(),
            }, { onConflict: 'skip_key' });
        persistentSkips.add(skipKey);
        attemptedRedeems.add(skipKey);
        console.log(`[AutoClaim] 💾 Persisted losing skip for ${skipKey}: ${reason}`);
    } catch (e: any) {
        // Ignore if table doesn't exist yet
        console.warn(`[AutoClaim] Could not persist skip for ${skipKey}: ${e.message}`);
    }
}

export function startAutoClaimJob() {
    console.log("⏰ Starting Auto Claim Job...");

    // ── Load persisted losing skips from DB immediately on startup (survives restarts) ──────
    try {
        const client = (db as any).getClient();
        loadPersistentSkips(client).catch(err => {
            console.error("[AutoClaim] Failed to load persistent skips on startup:", err.message || err);
        });
    } catch (dbErr: any) {
        console.warn("[AutoClaim] Database client not initialized yet for startup skips load:", dbErr.message);
    }

    let isRunning = false;
    setInterval(async () => {
        if (isRunning) return;
        isRunning = true;

        try {
            const client = (db as any).getClient();

            // ── Load persisted losing skips from DB (survives restarts) ──────
            await loadPersistentSkips(client);

            // Filter users to only those who have actually placed a bet in Predict feature
            let targetTelegramIds: number[] | null = null;
            try {
                const { data: activeTrades } = await client
                    .from("miniapp_trades")
                    .select("telegram_id");
                if (activeTrades && activeTrades.length > 0) {
                    targetTelegramIds = Array.from(new Set(activeTrades.map((t: any) => t.telegram_id)));
                }
            } catch (tradeErr: any) {
                console.warn("[AutoClaim] Failed to query miniapp_trades for optimization (falling back to all users):", tradeErr.message);
            }

            let query = client
                .from("users")
                .select("id, wallet_index, deposit_wallet_address, telegram_id")
                .not("deposit_wallet_address", "is", null);

            if (targetTelegramIds && targetTelegramIds.length > 0) {
                query = query.in("telegram_id", targetTelegramIds);
            }

            const { data: users, error } = await query;

            if (error || !users) return;

            const { polymarketRelayerService } = await import("./relayer");
            const { polymarketService } = await import("./polymarket");
            const { bot } = await import("../bot");

            const rpcUrl = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const ctfContract = new ethers.Contract(
                ethers.getAddress("0x4d97dcd97ec945f40cf65f87097ace5ea0476045"),
                [
                    "function balanceOf(address, uint256) view returns (uint256)",
                    "function payoutDenominator(bytes32) view returns (uint256)",
                    "function payoutNumerators(bytes32, uint256) view returns (uint256)"
                ],
                provider
            );

            // Process users in chunks to speed up position fetching while preventing rate limits
            const CHUNK_SIZE = 5;
            for (let i = 0; i < users.length; i += CHUNK_SIZE) {
                const chunk = users.slice(i, i + CHUNK_SIZE);
                await Promise.allSettled(chunk.map(async (user: any) => {
                    try {
                        const positions = await polymarketService.getPositionsForProxy(user.deposit_wallet_address);
                        const potentialClaims = positions.filter((p: any) => p.redeemable > 0 || parseFloat(p.size) > 0.001);

                        for (const pos of potentialClaims) {
                            const attemptKey = `${user.wallet_index}-${pos.conditionId}`;

                            // ── Skip if already marked as losing (persisted or in-memory) ──
                            if (attemptedRedeems.has(attemptKey) || persistentSkips.has(attemptKey)) continue;

                            const lastAttempt = redeemAttempts.get(attemptKey) ?? 0;
                            if (Date.now() - lastAttempt < 5 * 60 * 1000) continue; // 5 min cooldown

                            let isResolved = pos.redeemable > 0;

                            if (pos.asset) {
                                try {
                                    // 1. Check if the market is actually resolved if API didn't say so
                                    if (!isResolved) {
                                        if (resolvedConditionsCache.has(pos.conditionId)) {
                                            isResolved = true;
                                        } else {
                                            // Only check on-chain resolution once per minute across all users
                                            const lastChecked = unresolvedConditionsCheckTime.get(pos.conditionId) || 0;
                                            if (Date.now() - lastChecked > 60 * 1000) {
                                                const denom = await ctfContract.payoutDenominator(pos.conditionId);
                                                unresolvedConditionsCheckTime.set(pos.conditionId, Date.now());
                                                if (denom > 0n) {
                                                    isResolved = true;
                                                    resolvedConditionsCache.add(pos.conditionId);
                                                }
                                            }
                                        }
                                    }

                                    if (!isResolved) continue;

                                    // 2. Check if user actually has balance
                                    const balance = await ctfContract.balanceOf(user.deposit_wallet_address, BigInt(pos.asset));
                                    if (balance === 0n) {
                                        console.log(`[AutoClaim] User ${user.wallet_index} has 0 balance for asset ${pos.asset}. Persisting skip.`);
                                        await persistLosingSkip(client, attemptKey, pos.conditionId, user.wallet_index, 'zero_balance');
                                        continue;
                                    }
                                } catch (balanceErr: any) {
                                    console.warn(`[AutoClaim] Failed to verify balance/resolution for condition ${pos.conditionId}:`, balanceErr.message);
                                    if (!isResolved) continue;
                                }
                            } else if (!isResolved) {
                                continue;
                            }

                            try {
                                const denom = await ctfContract.payoutDenominator(pos.conditionId);
                                if (denom === 0n) {
                                    console.log(`[AutoClaim] Condition ${pos.conditionId} not resolved yet.`);
                                    continue;
                                }

                                const payout0 = await ctfContract.payoutNumerators(pos.conditionId, 0);
                                const payout1 = await ctfContract.payoutNumerators(pos.conditionId, 1);

                                let winningIndexSet = null;
                                if (payout0 > 0n) winningIndexSet = 1;
                                else if (payout1 > 0n) winningIndexSet = 2;

                                if (!winningIndexSet) {
                                    // ── Losing outcome confirmed — persist skip permanently ──────
                                    console.log(`[AutoClaim] Condition ${pos.conditionId} resolved but no winning payout. Persisting losing skip.`);
                                    await persistLosingSkip(client, attemptKey, pos.conditionId, user.wallet_index, 'no_winning_payout');
                                    continue;
                                }

                                redeemAttempts.set(attemptKey, Date.now());

                                let success = false;
                                let actualRedeemedHash = null;

                                try {
                                    console.log(`[AutoClaim] Redeeming condition ${pos.conditionId} (user: ${user.wallet_index}, indexSet: ${winningIndexSet})...`);
                                    const txHash = await polymarketRelayerService.redeemPositions(user.wallet_index, pos.conditionId, winningIndexSet);
                                    success = true;
                                    if (txHash && txHash.startsWith("0x")) {
                                        actualRedeemedHash = txHash;
                                        console.log(`[AutoClaim] ✅ Redeemed indexSet ${winningIndexSet} for user ${user.wallet_index} (tx: ${txHash})`);
                                    } else {
                                        console.log(`[AutoClaim] Skipped indexSet ${winningIndexSet} for user ${user.wallet_index}: ${txHash}`);
                                    }
                                } catch (redeemErr: any) {
                                    const msg: string = redeemErr.message || '';
                                    // ── Permanent losing outcome error — persist skip ─────────
                                    if (msg.includes('not a winning outcome') || msg.includes('payout is 0')) {
                                        console.warn(`[AutoClaim] Losing outcome confirmed for ${pos.conditionId} (user: ${user.wallet_index}). Persisting skip.`);
                                        await persistLosingSkip(client, attemptKey, pos.conditionId, user.wallet_index, `redeem_error: ${msg.slice(0, 80)}`);
                                    } else {
                                        console.warn(`[AutoClaim] Redeem failed for indexSet ${winningIndexSet} (user: ${user.wallet_index}):`, msg);
                                        const fails = (failedRedeemCounts.get(attemptKey) ?? 0) + 1;
                                        failedRedeemCounts.set(attemptKey, fails);
                                        if (fails >= 3) {
                                            console.warn(`[AutoClaim] Condition ${pos.conditionId} failed ${fails} times. Blacklisting.`);
                                            attemptedRedeems.add(attemptKey);
                                        }
                                    }
                                }

                                if (success) {
                                    attemptedRedeems.add(attemptKey);
                                    failedRedeemCounts.delete(attemptKey);

                                    // Clear user predictions snapshot cache so updated balance/positions show immediately
                                    if (user.telegram_id) {
                                        await polymarketService.clearUserPredictionsCache(user.telegram_id).catch(() => {});
                                    }

                                    // Notify via Telegram only for actual on-chain wins
                                    const isPosRedeemableValid = typeof pos.redeemable === 'number' ? pos.redeemable > 0 : (pos.redeemable === true || parseFloat(pos.redeemable) > 0);
                                    if (actualRedeemedHash && isPosRedeemableValid && user.telegram_id) {
                                        try {
                                            let payoutAmount = typeof pos.redeemable === 'number' ? pos.redeemable : parseFloat(pos.redeemable);
                                            if (isNaN(payoutAmount) || typeof pos.redeemable === 'boolean') {
                                                payoutAmount = parseFloat(pos.size || "0");
                                            }
                                            await bot.api.sendMessage(user.telegram_id,
                                                `🏆 *Market Resolved!*\n\nYour winning position has been automatically claimed.\n\n💰 *+$${payoutAmount.toFixed(2)} pUSD* added to your wallet.\n\nOpen the app to see your updated balance.`,
                                                { parse_mode: "Markdown" }
                                            );
                                        } catch (botErr) {
                                            console.error(`[AutoClaim] Failed to send Telegram message to ${user.telegram_id}:`, botErr);
                                        }
                                    }
                                }
                            } catch (posErr: any) {
                                console.error(`[AutoClaim] Loop error for ${pos.conditionId} (user: ${user.wallet_index}):`, posErr.message);
                            }
                        }
                    } catch (e: any) {
                        console.error(`[AutoClaim] Failed for user ${user.wallet_index}:`, e.message);
                    }
                }));
            }
        } catch (e) {
            console.error("[JOB] Auto claim error:", e);
        } finally {
            isRunning = false;
        }
    }, 15 * 60 * 1000); // every 15 minutes
}

export function startPredictionSyncJob() {
    console.log("⏰ Starting Prediction Trades Sync Job...");
    
    // Run sync immediately on startup
    import("../jobs/syncPredictionTrades").then(({ syncPredictionTrades }) => {
        syncPredictionTrades().catch(err => {
            console.error("[JOB] Prediction trades initial sync error:", err);
        });
    });

    // Run every 24 hours
    setInterval(async () => {
        try {
            const { syncPredictionTrades } = await import("../jobs/syncPredictionTrades");
            await syncPredictionTrades();
        } catch (err) {
            console.error("[JOB] Prediction trades sync cron error:", err);
        }
    }, 24 * 60 * 60 * 1000);
}

export function startPredictionResolutionJob() {
    console.log("⏰ Starting Prediction Trades Resolution Job...");

    // Run resolution checker immediately on startup
    import("../jobs/resolvePredictionTrades").then(({ resolvePredictionTrades }) => {
        resolvePredictionTrades().catch(err => {
            console.error("[JOB] Prediction trades initial resolution check error:", err);
        });
    });

    // Run every 10 minutes
    setInterval(async () => {
        try {
            const { resolvePredictionTrades } = await import("../jobs/resolvePredictionTrades");
            await resolvePredictionTrades();
        } catch (err) {
            console.error("[JOB] Prediction trades resolution cron error:", err);
        }
    }, 10 * 60 * 1000);
}
