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

export function startAutoClaimJob() {
    console.log("⏰ Starting Auto Claim Job...");

    setInterval(async () => {
        try {
            const client = (db as any).getClient();
            const { data: users, error } = await client
                .from("users")
                .select("id, wallet_index, deposit_wallet_address, telegram_id")
                .not("deposit_wallet_address", "is", null);

            if (error || !users) return;

            const { polymarketRelayerService } = await import("./relayer");
            const { polymarketService } = await import("./polymarket");
            const { bot } = await import("../bot");

            for (const user of users) {
                try {
                    const positions = await polymarketService.getPositionsForProxy(user.deposit_wallet_address);
                    // Check positions that API marks as redeemable, OR positions that have size > 0 (might be resolved but API is slow)
                    const potentialClaims = positions.filter((p: any) => p.redeemable > 0 || parseFloat(p.size) > 0.001);

                    for (const pos of potentialClaims) {
                        const attemptKey = `${user.wallet_index}-${pos.conditionId}`;
                        if (attemptedRedeems.has(attemptKey)) continue;

                        const lastAttempt = redeemAttempts.get(attemptKey) ?? 0;
                        if (Date.now() - lastAttempt < 5 * 60 * 1000) continue; // 5 min cooldown

                        // Check on-chain balance and resolution before redeeming
                        let isResolved = false;
                        if (pos.redeemable > 0) {
                            isResolved = true;
                        }

                        if (pos.asset) {
                            try {
                                const rpcUrl = process.env.POLYGON_RPC_URL || "https://polygon.llamarpc.com";
                                const provider = new ethers.JsonRpcProvider(rpcUrl);
                                const ctfContract = new ethers.Contract(
                                    ethers.getAddress("0x4d97dcd97ec945f40cf65f87097ace5ea0476045"),
                                    [
                                        "function balanceOf(address, uint256) view returns (uint256)",
                                        "function payoutDenominator(bytes32) view returns (uint256)"
                                    ],
                                    provider
                                );
                                
                                // 1. Check if the market is actually resolved if API didn't say so
                                if (!isResolved) {
                                    if (resolvedConditionsCache.has(pos.conditionId)) {
                                        isResolved = true;
                                    } else {
                                        const denom = await ctfContract.payoutDenominator(pos.conditionId);
                                        if (denom > 0n) {
                                            isResolved = true;
                                            resolvedConditionsCache.add(pos.conditionId);
                                        }
                                    }
                                }

                                if (!isResolved) continue; // Skip if not resolved yet

                                // 2. Check if user actually has balance
                                const balance = await ctfContract.balanceOf(user.deposit_wallet_address, BigInt(pos.asset));
                                if (balance === 0n) {
                                    console.log(`[AutoClaim] User ${user.wallet_index} (${user.deposit_wallet_address}) has 0 balance on-chain for asset ${pos.asset}. Skipping and caching.`);
                                    attemptedRedeems.add(attemptKey); // already claimed or nothing to claim, cache to avoid querying again
                                    continue;
                                }
                            } catch (balanceErr: any) {
                                console.warn(`[AutoClaim] Failed to verify balance/resolution for condition ${pos.conditionId}:`, balanceErr.message);
                                // If the RPC/check fails and we don't know it's resolved, skip to be safe.
                                if (!isResolved) continue;
                            }
                        } else if (!isResolved) {
                            continue;
                        }

                        try {
                            const outcomeIndex = typeof pos.outcomeIndex === 'string' ? parseInt(pos.outcomeIndex) : pos.outcomeIndex;
                            const preferredIndexSet = outcomeIndex === 0 ? 1 : 2;
                            const fallbackIndexSet = preferredIndexSet === 1 ? 2 : 1;

                            redeemAttempts.set(attemptKey, Date.now());

                            let success = false;
                            for (const indexSet of [preferredIndexSet, fallbackIndexSet]) {
                                try {
                                    console.log(`[AutoClaim] Attempting redeem for ${pos.conditionId} (user: ${user.wallet_index}, indexSet: ${indexSet})...`);
                                    await polymarketRelayerService.redeemPositions(user.wallet_index, pos.conditionId, indexSet);
                                    success = true;
                                    console.log(`[AutoClaim] Redeemed indexSet ${indexSet} successfully for user ${user.wallet_index}`);
                                    break;
                                } catch (redeemErr: any) {
                                    console.warn(`[AutoClaim] Redeem failed for indexSet ${indexSet} (user: ${user.wallet_index}):`, redeemErr.message);
                                }
                            }

                            if (success) {
                                attemptedRedeems.add(attemptKey);
                                failedRedeemCounts.delete(attemptKey);
                                
                                // Notify Telegram Bot
                                if (user.telegram_id) {
                                    try {
                                        await bot.api.sendMessage(user.telegram_id,
                                            `🏆 *Market Resolved!*\n\nYour winning position has been automatically claimed.\n\n💰 *+$${pos.redeemable || "Unknown"} pUSD* added to your wallet.\n\nOpen the app to see your updated balance.`,
                                            { parse_mode: "Markdown" }
                                        );
                                    } catch (botErr) {
                                        console.error(`[AutoClaim] Failed to send telegram message to ${user.telegram_id}:`, botErr);
                                    }
                                }
                            } else {
                                console.error(`[AutoClaim] Both indexSets failed to redeem for ${pos.conditionId} (user: ${user.wallet_index})`);
                                const fails = (failedRedeemCounts.get(attemptKey) ?? 0) + 1;
                                failedRedeemCounts.set(attemptKey, fails);
                                if (fails >= 3) {
                                    console.warn(`[AutoClaim] Condition ${pos.conditionId} failed 3 times. Blacklisting to prevent log spam.`);
                                    attemptedRedeems.add(attemptKey);
                                }
                            }
                        } catch (posErr: any) {
                            console.error(`[AutoClaim] Loop error for ${pos.conditionId} (user: ${user.wallet_index}):`, posErr.message);
                        }
                    }
                } catch (e: any) {
                    console.error(`[AutoClaim] Failed for user ${user.wallet_index}:`, e.message);
                }
            }
        } catch (e) {
            console.error("[JOB] Auto claim error:", e);
        }
    }, 60 * 1000); // every 60 seconds
}
