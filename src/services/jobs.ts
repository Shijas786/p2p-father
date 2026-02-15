import { db } from "../db/client";
import { env } from "../config/env";

export function startExpiryJob() {
    console.log("⏰ Starting Ad Expiry Job...");

    // Check every 1 minute
    setInterval(async () => {
        try {
            // Expiry job disabled until expires_at column is added to DB
            /*
            const now = new Date().toISOString();
            const client = (db as any).getClient(); 
            const { data: expiredOrders, error } = await client
                .from("orders")
                .select("id")
                .eq("status", "active")
                .lt("expires_at", now);
            ...
            */
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

                const tokens = ["USDC", "USDT"];
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
                                tokenAddress = (token === "USDT") ? "0x55d398326f99059fF775485246999027B3197955" : "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
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
