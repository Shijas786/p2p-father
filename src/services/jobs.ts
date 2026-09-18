import { db } from "../db/client";
import { env } from "../config/env";
import { deleteAdBroadcasts } from "../bot";
import { ethers } from "ethers";
import { feeCashbackService } from "./feeCashbackService";

/**
 * Immediately cancels any active SELL ads for a user on a specific token/chain
 * if their vault balance is now insufficient to back them.
 *
 * Called right after any successful vault withdrawal (MiniApp or WA bot)
 * to give buyers instant protection — no waiting for the 5-minute job.
 */
export async function cancelUnderfundedAds(
    userId: string,
    walletAddress: string,
    token: string,
    chain: string,
    escrowService: any
): Promise<void> {
    try {
        const client = (db as any).getClient();

        let tokenAddress = "";
        if (chain === "bsc") {
            tokenAddress = token === "BNB"
                ? "0x0000000000000000000000000000000000000000"
                : (token === "USDT" ? "0x55d398326f99059fF775485246999027B3197955" : "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d");
        } else if (chain === "bsc_testnet") {
            tokenAddress = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";
        } else {
            tokenAddress = token === "USDT" ? env.USDT_ADDRESS : env.USDC_ADDRESS;
        }

        const balanceStr = await escrowService.getVaultBalance(walletAddress, tokenAddress, chain);
        const physicalBalance = parseFloat(balanceStr);
        const reserved = await db.getReservedAmount(userId, token, chain);

        if (physicalBalance >= reserved) return; // Still covered — nothing to cancel

        console.warn(`[INSTANT-CANCEL] User ${walletAddress} under-funded on ${chain}/${token}. Balance: ${physicalBalance}, Reserved: ${reserved}. Cancelling ads now.`);

        // Cancel newest ads first until balance covers remaining reserved amount
        const { data: ads } = await client
            .from("orders")
            .select("id, amount, filled_amount")
            .eq("user_id", userId)
            .eq("status", "active")
            .eq("type", "sell")
            .eq("token", token)
            .eq("chain", chain)
            .order("created_at", { ascending: false });

        let currentReserved = reserved;
        if (ads) {
            for (const ad of ads) {
                if (currentReserved <= physicalBalance) break;

                console.log(`[INSTANT-CANCEL] Cancelling ad ${ad.id} — vault withdrawal left seller with insufficient balance.`);
                await client
                    .from("orders")
                    .update({ status: "cancelled", updated_at: new Date().toISOString() })
                    .eq("id", ad.id);

                deleteAdBroadcasts(ad.id).catch((err: any) => {
                    console.error(`[INSTANT-CANCEL] Failed to cleanup broadcasts for ad ${ad.id}:`, err);
                });

                currentReserved -= (ad.amount - (ad.filled_amount || 0));
            }
        }
    } catch (err: any) {
        console.error("[INSTANT-CANCEL] Error during instant ad cancellation:", err?.message);
    }
}

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
                    
                    // If order is gone or not active and not filled, clean up
                    if (!order || (order.status !== 'active' && order.status !== 'filled')) {
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
                            } else if (chain === 'bsc_testnet') {
                                tokenAddress = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";
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

export function startTradeReconciliationJob() {
    console.log("🛡️ Starting P2P Trade On-Chain Reconciliation Worker (polls every 30s)...");

    setInterval(async () => {
        try {
            const client = (db as any).getClient();

            // Query trades in escrow_pending or release_pending state
            const { data: pendingTrades, error } = await client
                .from("trades")
                .select("*")
                .in("status", ["escrow_pending", "release_pending"])
                .limit(20);

            if (error || !pendingTrades || pendingTrades.length === 0) return;

            const { getFastProvider } = await import("../utils/provider");

            for (const trade of pendingTrades) {
                const txHash = trade.escrow_tx_hash || trade.release_tx_hash;
                if (!txHash) continue;

                try {
                    const chainKey = (trade.chain || "bsc").toLowerCase();
                    const provider = getFastProvider(chainKey);

                    const txReceipt = await provider.getTransactionReceipt(txHash);
                    if (txReceipt && txReceipt.status === 1) {
                        if (trade.status === "waiting_for_escrow" || trade.status === "matched") {
                            await db.updateTrade(trade.id, {
                                status: "in_escrow",
                                escrow_tx_hash: txHash,
                            });
                            console.log(`[Reconciliation] ✅ Trade ${trade.id} escrow TX ${txHash} confirmed on-chain! Status -> in_escrow`);
                        } else if (trade.status === "releasing") {
                            await db.updateTrade(trade.id, {
                                status: "completed",
                                release_tx_hash: txHash,
                            });
                            // Process VIP Fee Cashback if qualifying
                            feeCashbackService.processTradeFeeCashback(trade.id).catch(console.error);
                            console.log(`[Reconciliation] 🎉 Trade ${trade.id} release TX ${txHash} confirmed on-chain! Status -> completed`);
                        }
                    } else if (txReceipt && txReceipt.status === 0) {
                        console.warn(`[Reconciliation] ❌ Trade ${trade.id} TX ${txHash} failed on-chain.`);
                    }
                } catch (err: any) {
                    console.error(`[Reconciliation] Error checking TX for trade ${trade.id}:`, err.message);
                }
            }
        } catch (err: any) {
            console.error("[Reconciliation] Worker error:", err.message);
        }
    }, 30 * 1000); // Poll every 30 seconds
}
