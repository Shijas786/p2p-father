import { db } from "../db/client";
import { env } from "../config/env";
import { deleteAdBroadcasts } from "../bot";

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
                    const redeemable = positions.filter((p: any) => p.redeemable > 0);

                    for (const pos of redeemable) {
                        console.log(`[AutoClaim] Redeeming ${pos.conditionId} for user ${user.wallet_index}`);
                        await polymarketRelayerService.redeemPositions(user.wallet_index, pos.conditionId);
                        
                        // Notify Telegram Bot
                        if (user.telegram_id) {
                            try {
                                await bot.api.sendMessage(user.telegram_id,
                                    `🏆 *Market Resolved!*\n\nYour winning position has been automatically claimed.\n\n💰 *+$${pos.redeemable} pUSD* added to your wallet.\n\nOpen the app to see your updated balance.`,
                                    { parse_mode: "Markdown" }
                                );
                            } catch (botErr) {
                                console.error(`[AutoClaim] Failed to send telegram message to ${user.telegram_id}:`, botErr);
                            }
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
