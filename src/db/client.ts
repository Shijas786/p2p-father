import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env";
import type { User, Order, Trade, PaymentProof, AdminDisputeResolution } from "../types";

class Database {
    private client: SupabaseClient | null = null;

    public getClient(): SupabaseClient {
        if (!this.client) {
            if (!env.SUPABASE_URL || (!env.SUPABASE_SERVICE_KEY && !env.SUPABASE_ANON_KEY)) {
                throw new Error("Supabase credentials not configured");
            }
            this.client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY);
        }
        return this.client;
    }

    // ═══════════════════════════════════════
    //              USERS
    // ═══════════════════════════════════════

    async getOrCreateUser(telegramId: number, username?: string, firstName?: string): Promise<User> {
        const db = this.getClient();

        // Try to find existing user
        const { data: existing } = await db
            .from("users")
            .select("*")
            .eq("telegram_id", telegramId)
            .single();

        if (existing) {
            // Update username/first_name if changed
            if (username !== existing.username || firstName !== existing.first_name) {
                const { data: updated } = await db
                    .from("users")
                    .update({ username, first_name: firstName, updated_at: new Date().toISOString() })
                    .eq("telegram_id", telegramId)
                    .select()
                    .single();

                if (updated) return updated as User;
            }
            return existing as User;
        }

        // ═══ RACE-SAFE WALLET INDEX ASSIGNMENT ═══
        // Retry loop to handle concurrent signups getting the same index.
        // The DB has a UNIQUE constraint on wallet_index, so duplicates will error.
        let attempts = 0;
        const MAX_ATTEMPTS = 5;

        while (attempts < MAX_ATTEMPTS) {
            attempts++;

            // Get current max real index (filter out synthetic demo-merchant indexes >= 900000)
            const { data: maxResult } = await db
                .from("users")
                .select("wallet_index")
                .not("wallet_index", "is", null)
                .lt("wallet_index", 900000)
                .order("wallet_index", { ascending: false })
                .limit(1)
                .maybeSingle();

            const nextIndex = ((maxResult as any)?.wallet_index ?? 0) + 1;

            // Derive wallet address immediately (prevents the old bug where
            // wallet was only derived on first /auth call)
            let walletAddress: string | null = null;
            try {
                // Import wallet service inline to avoid circular deps
                const { wallet: walletSvc } = await import("../services/wallet");
                const derived = walletSvc.deriveWallet(nextIndex);
                walletAddress = derived.address;
            } catch (e) {
                console.error("[DB] Failed to derive wallet for new user:", e);
            }

            const { data: newUser, error } = await db
                .from("users")
                .insert({
                    telegram_id: telegramId,
                    username: username || null,
                    first_name: firstName || null,
                    wallet_index: nextIndex,
                    wallet_address: walletAddress,
                    wallet_type: walletAddress ? 'bot' : null,
                    receive_address: null,
                })
                .select()
                .single();

            if (error) {
                // If it's a unique constraint violation on wallet_index, retry
                if (error.message.includes("wallet_index") || error.message.includes("duplicate") || error.message.includes("unique")) {
                    console.warn(`[DB] wallet_index ${nextIndex} collision (attempt ${attempts}), retrying...`);
                    continue;
                }
                throw new Error(`Failed to create user: ${error.message}`);
            }

            console.log(`[DB] Created user ${newUser.id} with wallet_index=${nextIndex}, address=${walletAddress}`);
            return newUser as User;
        }

        throw new Error("Failed to create user after max retries (wallet_index collision)");
    }

    async getUserByTelegramId(telegramId: number): Promise<User | null> {
        const db = this.getClient();
        const { data } = await db
            .from("users")
            .select("*")
            .eq("telegram_id", telegramId)
            .maybeSingle();
        return data as User | null;
    }

    async getUserByWalletIndex(walletIndex: number): Promise<User | null> {
        const db = this.getClient();
        const { data } = await db
            .from("users")
            .select("*")
            .eq("wallet_index", walletIndex)
            .maybeSingle();
        return data as User | null;
    }

    async getUserById(userId: string): Promise<User | null> {
        const db = this.getClient();
        const { data } = await db
            .from("users")
            .select("*")
            .eq("id", userId)
            .maybeSingle();
        return data as User | null;
    }

    async updateUser(userId: string, updates: Partial<User>): Promise<void> {
        const db = this.getClient();
        await db
            .from("users")
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq("id", userId);
    }

    async completeUserTrade(userId: string, isSuccessful: boolean, amount?: number, otherPartyId?: string): Promise<void> {
        const user = await this.getUserById(userId);
        if (!user) return;

        const newTradeCount = (user.trade_count || 0) + 1;
        const newCompletedCount = (user.completed_trades || 0) + (isSuccessful ? 1 : 0);

        let newTrust = (user.trust_score || 0);
        if (isSuccessful) {
            newTrust = Math.min(100, newTrust + 5);
        } else {
            newTrust = Math.max(0, newTrust - 20);
        }

        // ═══ LEADERBOARD POINTS & VOLUME ═══
        let additionalPoints = 0;
        let newVolume = parseFloat(user.total_volume?.toString() || "0");

        if (isSuccessful && amount && amount > 0) {
            newVolume += amount;

            // 1 Point per 1 Volume
            additionalPoints += amount;

            // Unique User Bonus (20 pts)
            if (otherPartyId) {
                const db = this.getClient();
                // Check if this is the FIRST completed trade between these two
                // valid trades are "completed"
                const { count, error } = await db
                    .from("trades")
                    .select("id", { count: "exact", head: true })
                    .or(`and(buyer_id.eq.${userId},seller_id.eq.${otherPartyId}),and(buyer_id.eq.${otherPartyId},seller_id.eq.${userId})`)
                    .eq("status", "completed");

                // If count is 1, it means this current trade is the ONLY one (or the first one found).
                // Actually, this function is called AFTER status update to 'completed'.
                // So count should be at least 1. If count == 1, it's the first time.
                if (!error && count === 1) {
                    console.log(`[POINTS] First trade bonus for ${userId} with ${otherPartyId}`);
                    additionalPoints += 20;
                }
            }
        }

        const newPoints = parseFloat(user.points?.toString() || "0") + additionalPoints;

        await this.updateUser(userId, {
            trade_count: newTradeCount,
            completed_trades: newCompletedCount,
            trust_score: newTrust,
            total_volume: newVolume,
            points: newPoints
        } as any);
    }

    async getAllTelegramIds(): Promise<number[]> {
        const db = this.getClient();
        const { data } = await db.from("users").select("telegram_id");
        return (data || []).map((u: any) => u.telegram_id);
    }

    // ═══════════════════════════════════════
    //              ORDERS
    // ═══════════════════════════════════════

    async createOrder(order: Partial<Order>): Promise<Order> {
        const db = this.getClient();
        const { data, error } = await db
            .from("orders")
            .insert(order)
            .select()
            .single();

        if (error) throw new Error(`Failed to create order: ${error.message}`);
        return data as Order;
    }

    async getActiveOrders(type?: string, token?: string, limit = 20, chain?: string): Promise<Order[]> {
        const db = this.getClient();
        let query = db
            .from("orders")
            .select("*, users!inner(username, first_name, trust_score, completed_trades, wallet_address, telegram_id, whatsapp_phone, photo_url, hide_group_handle)")
            .eq("status", "active")
            // ── Always exclude testnet chains from live orderbook ──────────────
            .not("chain", "in", '("bsc_testnet","base_sepolia")')
            .order("rate", { ascending: type === "sell" })
            .limit(limit);

        if (token && token !== "all") {
            query = query.eq("token", token);
        }

        if (type) {
            query = query.eq("type", type);
        }

        if (chain) {
            query = query.eq("chain", chain);
        }

        const { data, error } = await query;
        if (error) throw new Error(`Failed to get orders: ${error.message}`);


        return (data || []).map((d: any) => {
            const isHidden = Boolean(d.users?.hide_group_handle);
            let displayName = d.users?.username ? `@${d.users.username}` : (d.users?.first_name || "Trader");
            if (isHidden) {
                if (d.users?.username && d.users.username.length > 2) {
                    displayName = `@${d.users.username.slice(0, 2)}***`;
                } else if (d.users?.first_name && d.users.first_name.length > 2) {
                    displayName = `${d.users.first_name.slice(0, 2)}***`;
                } else {
                    displayName = "Anonymous Trader";
                }
            }

            return {
                ...d,
                username: displayName,
                raw_username: isHidden ? undefined : d.users?.username,
                hide_group_handle: isHidden,
                trust_score: d.users?.trust_score,
                wallet_address: d.users?.wallet_address,
                telegram_id: d.users?.telegram_id,
                whatsapp_phone: d.users?.whatsapp_phone,
                photo_url: isHidden ? undefined : d.users?.photo_url,
            };
        }) as Order[];
    }

    async getOrderById(orderId: string): Promise<Order | null> {
        const db = this.getClient();
        const { data, error } = await db
            .from("orders")
            .select("*, users!inner(username, first_name, trust_score, upi_id, photo_url, telegram_id, whatsapp_phone)")
            .eq("id", orderId)
            .single();
        if (error) {
            console.error(`[DB] getOrderById error: ${error.message} (id: ${orderId})`);
            return null;
        }
        if (!data) return null;
        return {
            ...data,
            username: data.users?.username || data.users?.first_name || "Unknown",
            trust_score: data.users?.trust_score,
            upi_id: data.users?.upi_id,
            photo_url: data.users?.photo_url,
            telegram_id: data.users?.telegram_id,
            whatsapp_phone: data.users?.whatsapp_phone,
        } as Order;
    }

    async getUserOrders(userId: string): Promise<Order[]> {
        const db = this.getClient();
        const { data, error } = await db
            .from("orders")
            .select("*")
            .eq("user_id", userId)
            .in("status", ["active", "paused", "filled"])
            .order("created_at", { ascending: false });

        if (error) throw new Error(`Failed to get user orders: ${error.message}`);

        return (data || []) as Order[];
    }

    async getReservedAmount(userId: string, token: string, chain: string): Promise<number> {
        const db = this.getClient();
        const { data } = await db
            .from("orders")
            .select("amount, filled_amount")
            .eq("user_id", userId)
            .eq("type", "sell")
            .eq("token", token)
            .eq("chain", chain)
            .eq("status", "active");

        return (data || []).reduce((sum, order) => sum + (order.amount - (order.filled_amount || 0)), 0);
    }

    async updateOrder(orderId: string, updates: Partial<Order>): Promise<void> {
        const db = this.getClient();
        await db
            .from("orders")
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq("id", orderId);
    }

    /**
     * Atomically fill an order to prevent double-matching
     */
    async fillOrder(orderId: string, amount: number): Promise<boolean> {
        const db = this.getClient();

        // 1. Get current order
        const { data: order } = await db
            .from("orders")
            .select("amount, filled_amount, status")
            .eq("id", orderId)
            .single();

        if (!order || order.status !== "active") return false;

        const oldFilled = parseFloat(order.filled_amount.toString());
        const newFilled = oldFilled + amount;

        if (newFilled > parseFloat(order.amount.toString())) return false;

        const newStatus = newFilled >= parseFloat(order.amount.toString()) ? "filled" : "active";

        // 2. Atomic update: only update if filled_amount hasn't changed since our read
        const { data, error } = await db
            .from("orders")
            .update({
                filled_amount: newFilled,
                status: newStatus,
                updated_at: new Date().toISOString()
            })
            .eq("id", orderId)
            .eq("filled_amount", oldFilled) // OCC check
            .eq("status", "active")
            .select();

        return !error && data && data.length > 0;
    }
    /**
     * Revert a fill if the trade creation fails
     */
    async revertFillOrder(orderId: string, amount: number): Promise<void> {
        const db = this.getClient();

        // Use recursive-like retry or just atomic revert if possible
        // But since we are reverting, we don't strictly need OCC as long as we subtract
        // However, Supabase doesn't support relative updates (field = field - x) directly via client
        // So we use OCC again to be safe

        let success = false;
        let attempts = 0;

        while (!success && attempts < 3) {
            attempts++;
            const { data: order } = await db
                .from("orders")
                .select("filled_amount, amount, status")
                .eq("id", orderId)
                .single();

            if (!order) return;

            const oldFilled = parseFloat(order.filled_amount.toString());
            const newFilled = Math.max(0, oldFilled - amount);

            // If the order was already manually cancelled or expired, preserve that status.
            // Otherwise, since it is no longer fully matched, set it back to active.
            const newStatus = (order.status === "cancelled" || order.status === "expired")
                ? order.status
                : "active";

            const { data } = await db
                .from("orders")
                .update({
                    filled_amount: newFilled,
                    status: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq("id", orderId)
                .eq("filled_amount", oldFilled)
                .select();

            if (data && data.length > 0) success = true;
        }
    }

    async cancelOrder(orderId: string): Promise<void> {
        const db = this.getClient();
        const { data, error } = await db
            .from("orders")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", orderId)
            .eq("status", "active")
            .select();
        if (error) throw new Error(`Failed to cancel order: ${error.message}`);
        if (!data || data.length === 0) throw new Error("Order is not active or does not exist");
    }

    // ═══════════════════════════════════════
    //              TRADES
    // ═══════════════════════════════════════

    async createTrade(trade: Partial<Trade>): Promise<Trade> {
        const db = this.getClient();
        const { data, error } = await db
            .from("trades")
            .insert(trade)
            .select()
            .single();

        if (error) throw new Error(`Failed to create trade: ${error.message}`);
        return data as Trade;
    }

    async getTradeById(tradeId: string): Promise<Trade | null> {
        const db = this.getClient();
        const { data } = await db
            .from("trades")
            .select("*, seller:users!trades_seller_id_fkey(upi_id, username, first_name, phone_number, bank_account_number, bank_ifsc, bank_name, cdm_bank_number, cdm_bank_name, cdm_phone, cdm_user_name, digital_rupee_id, telegram_id, photo_url, receive_address), buyer:users!trades_buyer_id_fkey(username, first_name, photo_url, telegram_id, receive_address)")
            .eq("id", tradeId)
            .single();

        if (!data) return null;

        return {
            ...data,
            seller_upi_id: data.seller?.upi_id,
            seller_username: data.seller?.username || data.seller?.first_name || "Seller",
            seller_phone: data.seller?.phone_number,
            seller_bank_account: data.seller?.bank_account_number,
            seller_bank_ifsc: data.seller?.bank_ifsc,
            seller_bank_name: data.seller?.bank_name,
            seller_telegram_id: data.seller?.telegram_id,
            seller_photo_url: data.seller?.photo_url,
            seller_cdm_bank_number: data.seller?.cdm_bank_number,
            seller_cdm_bank_name: data.seller?.cdm_bank_name,
            seller_cdm_phone: data.seller?.cdm_phone,
            seller_cdm_user_name: data.seller?.cdm_user_name,
            seller_digital_rupee_id: data.seller?.digital_rupee_id,

            buyer_username: data.buyer?.username || data.buyer?.first_name || "Buyer",
            buyer_photo_url: data.buyer?.photo_url,
            buyer_telegram_id: data.buyer?.telegram_id,
            buyer_custom_address: data.buyer_custom_address,
        } as any;
    }

    async getUserTrades(userId: string, limit = 10): Promise<Trade[]> {
        const db = this.getClient();
        const { data } = await db
            .from("trades")
            .select("*, seller:users!trades_seller_id_fkey(username, first_name, photo_url), buyer:users!trades_buyer_id_fkey(username, first_name, photo_url)")
            .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
            .order("created_at", { ascending: false })
            .limit(limit);

        return (data || []).map((t: any) => ({
            ...t,
            seller_username: t.seller?.username || t.seller?.first_name || "Seller",
            seller_photo_url: t.seller?.photo_url,
            buyer_username: t.buyer?.username || t.buyer?.first_name || "Buyer",
            buyer_photo_url: t.buyer?.photo_url,
        })) as any[];
    }

    async getActiveTrades(): Promise<Trade[]> {
        const db = this.getClient();
        const { data } = await db
            .from("trades")
            .select("*")
            .in("status", ["matched", "in_escrow", "fiat_sent", "fiat_confirmed"])
            .order("created_at", { ascending: true });
        return (data || []) as Trade[];
    }

    async getDisputedTrades(): Promise<Trade[]> {
        const db = this.getClient();
        const { data } = await db
            .from("trades")
            .select("*")
            .eq("status", "disputed")
            .order("created_at", { ascending: true });
        return (data || []) as Trade[];
    }

    async updateTrade(tradeId: string, updates: Partial<Trade>): Promise<void> {
        const db = this.getClient();
        await db
            .from("trades")
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq("id", tradeId);
    }

    /**
     * Atomically transition a trade status from one state to another.
     * Prevents race conditions where multiple requests attempt the same transition.
     */
    async updateTradeStatusAtomic(
        tradeId: string, 
        fromStatus: string | string[], 
        toStatus: string, 
        updates: Partial<Trade> = {}
    ): Promise<boolean> {
        const db = this.getClient();
        let query = db
            .from("trades")
            .update({ 
                status: toStatus, 
                ...updates,
                updated_at: new Date().toISOString() 
            })
            .eq("id", tradeId);

        if (Array.isArray(fromStatus)) {
            query = query.in("status", fromStatus);
        } else {
            query = query.eq("status", fromStatus);
        }

        const { data, error } = await query.select();

        if (error) {
            console.error(`[DB] updateTradeStatusAtomic error: ${error.message}`);
            return false;
        }

        return !!(data && data.length > 0);
    }


    async getTradesNeedingAutoRelease(): Promise<Trade[]> {
        const db = this.getClient();
        const { data } = await db
            .from("trades")
            .select("*")
            .eq("status", "fiat_sent")
            .lt("auto_release_at", new Date().toISOString())
            .not("auto_release_at", "is", null);
        return (data || []) as Trade[];
    }

    async getExpiredEscrows(): Promise<Trade[]> {
        const db = this.getClient();
        const now = new Date().toISOString();
        const { data } = await db
            .from("trades")
            .select("*")
            .eq("status", "in_escrow")
            .lt("created_at", new Date(Date.now() - parseInt(env.ESCROW_TIMEOUT_SECONDS) * 1000).toISOString());
        return (data || []) as Trade[];
    }

    // ═══════════════════════════════════════
    //          PAYMENT PROOFS
    // ═══════════════════════════════════════

    async savePaymentProof(proof: Partial<PaymentProof>): Promise<void> {
        const db = this.getClient();
        await db.from("payment_proofs").insert(proof);
    }

    async isUTRUsed(utr: string, excludeTradeId?: string): Promise<boolean> {
        const db = this.getClient();
        let query = db
            .from("payment_proofs")
            .select("id")
            .eq("utr", utr);

        if (excludeTradeId) {
            query = query.neq("trade_id", excludeTradeId);
        }

        const { data } = await query;
        return (data || []).length > 0;
    }

    // ═══════════════════════════════════════
    //              FEES
    // ═══════════════════════════════════════

    async recordFee(tradeId: string, amount: number, token: string, chain: string, txHash?: string): Promise<void> {
        const db = this.getClient();
        await db.from("fees").insert({
            trade_id: tradeId,
            amount,
            token,
            chain,
            tx_hash: txHash,
        });
    }

    // ═══════════════════════════════════════
    //           AD BROADCASTS
    // ═══════════════════════════════════════

    async saveAdBroadcasts(broadcasts: { order_id: string; chat_id: number; message_id: number }[]): Promise<void> {
        const db = this.getClient();
        const { error } = await db.from("ad_broadcasts").insert(broadcasts);
        if (error) console.error("Failed to save ad broadcasts:", error.message);
    }

    async getAdBroadcasts(orderId: string): Promise<{ chat_id: number; message_id: number }[]> {
        const db = this.getClient();
        const { data, error } = await db
            .from("ad_broadcasts")
            .select("chat_id, message_id")
            .eq("order_id", orderId);
        if (error) {
            console.error("Failed to get ad broadcasts:", error.message);
            return [];
        }
        return data || [];
    }

    async deleteAdBroadcasts(orderId: string): Promise<void> {
        const db = this.getClient();
        const { error } = await db.from("ad_broadcasts").delete().eq("order_id", orderId);
        if (error) console.error("Failed to delete ad broadcast records:", error.message);
    }

    async deleteSpecificAdBroadcast(orderId: string, chatId: number, messageId: number): Promise<void> {
        const db = this.getClient();
        const { error } = await db
            .from("ad_broadcasts")
            .delete()
            .eq("order_id", orderId)
            .eq("chat_id", chatId)
            .eq("message_id", messageId);
        if (error) console.error("Failed to delete specific ad broadcast record:", error.message);
    }

    async getTotalFees(): Promise<number> {
        const db = this.getClient();
        const { data } = await db.from("fees").select("amount");
        return (data || []).reduce((sum: number, f: any) => sum + f.amount, 0);
    }

    // ═══════════════════════════════════════
    //              CHAT
    // ═══════════════════════════════════════

    async getTradeMessages(tradeId: string): Promise<any[]> {
        const db = this.getClient();
        const { data, error } = await db
            .from("trade_messages")
            .select("*, users(username, telegram_id, first_name, photo_url)")
            .eq("trade_id", tradeId)
            .order("created_at", { ascending: true });

        if (error) throw new Error(`Failed to get messages: ${error.message}`);
        return (data || []).map((m: any) => ({
            ...m,
            username: m.users?.username,
            telegram_id: m.users?.telegram_id,
            photo_url: m.users?.photo_url, // Added for manual avatar
            first_name: m.users?.first_name,
        }));
    }

    async createTradeMessage(message: Partial<any>): Promise<any> {
        const db = this.getClient();
        const { data, error } = await db
            .from("trade_messages")
            .insert(message)
            .select()
            .single();

        if (error) throw new Error(`Failed to create message: ${error.message}`);
        return data;
    }

    // ═══════════════════════════════════════
    //              REFERRALS
    // ═══════════════════════════════════════

    async recordReferral(referrerTelegramId: number, referredTelegramId: number): Promise<void> {
        const db = this.getClient();
        
        // Ensure we don't overwrite an existing referral for the same invitee
        const { data: existing } = await db
            .from("referrals")
            .select("id")
            .eq("referred_telegram_id", referredTelegramId)
            .maybeSingle();

        if (existing) return;

        await db.from("referrals").insert({
            referrer_telegram_id: referrerTelegramId,
            referred_telegram_id: referredTelegramId,
            status: "pending"
        });
    }

    async getReferralsByReferrer(referrerTelegramId: number): Promise<{ total: number; qualified: number; pending: number; list: any[] }> {
        const db = this.getClient();
        const { data, error } = await db
            .from("referrals")
            .select("*")
            .eq("referrer_telegram_id", referrerTelegramId)
            .order("created_at", { ascending: false });

        if (error || !data) {
            return { total: 0, qualified: 0, pending: 0, list: [] };
        }

        const total = data.length;
        const qualified = data.filter((r: any) => r.status === "completed").length;
        const pending = total - qualified;

        return {
            total,
            qualified,
            pending,
            list: data
        };
    }

    async updateReferralStatus(referredTelegramId: number, status: "pending" | "completed"): Promise<void> {
        const db = this.getClient();
        await db
            .from("referrals")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("referred_telegram_id", referredTelegramId);
    }

    async getReferralByReferred(referredTelegramId: number): Promise<any | null> {
        const db = this.getClient();
        const { data } = await db
            .from("referrals")
            .select("*")
            .eq("referred_telegram_id", referredTelegramId)
            .maybeSingle();
        return data || null;
    }

    // ═══════════════════════════════════════
    //              STATS
    // ═══════════════════════════════════════

    async getStats() {
        const db = this.getClient();
        const [trades, completedTradesQuery, orders, users, fees, disputes] = await Promise.all([
            db.from("trades").select("id", { count: "exact" }),
            db.from("trades").select("amount", { count: "exact" }).in("status", ["completed", "COMPLETED"]),
            db.from("orders").select("id", { count: "exact" }).eq("status", "active"),
            db.from("users").select("id", { count: "exact" }),
            this.getTotalFees(),
            db.from("trades").select("id", { count: "exact" }).in("status", ["disputed", "DISPUTED"]),
        ]);

        const completedCount = completedTradesQuery.count || (completedTradesQuery.data || []).length;
        const totalVolume = (completedTradesQuery.data || []).reduce(
            (sum: number, t: any) => sum + (parseFloat(t.amount) || 0),
            0
        );

        return {
            total_trades: trades.count || 0,
            completed_trades: completedCount,
            active_orders: orders.count || 0,
            total_users: users.count || 0,
            total_volume_generic: totalVolume,
            total_fees_amount: fees,
            active_disputes: disputes.count || 0,
        };
    }

    private avgSpeedCache = new Map<string, { val: number | null; ts: number }>();

    async getUserAvgCompletionMinutes(userId: string): Promise<number | null> {
        try {
            const cached = this.avgSpeedCache.get(userId);
            if (cached && Date.now() - cached.ts < 60_000) {
                return cached.val;
            }

            const db = this.getClient();
            const { data: completedTrades } = await db
                .from("trades")
                .select("created_at, updated_at")
                .eq("status", "completed")
                .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
                .order("created_at", { ascending: false })
                .limit(30);

            if (!completedTrades || completedTrades.length === 0) {
                this.avgSpeedCache.set(userId, { val: null, ts: Date.now() });
                return null;
            }

            let totalMinutes = 0;
            let validCount = 0;

            for (const t of completedTrades) {
                if (t.created_at && t.updated_at) {
                    const diffMs = new Date(t.updated_at).getTime() - new Date(t.created_at).getTime();
                    const mins = diffMs / (1000 * 60);
                    // Filter out abnormal outliers (> 24 hours or negative duration)
                    if (mins > 0 && mins < 1440) {
                        totalMinutes += mins;
                        validCount++;
                    }
                }
            }

            if (validCount === 0) {
                this.avgSpeedCache.set(userId, { val: null, ts: Date.now() });
                return null;
            }
            const avgMins = Math.max(0.1, Number((totalMinutes / validCount).toFixed(1)));
            this.avgSpeedCache.set(userId, { val: avgMins, ts: Date.now() });
            return avgMins;
        } catch (err) {
            console.error("[DB] Error calculating avg completion time:", err);
            return null;
        }
    }

    async logDisputeResolution(resolution: Omit<AdminDisputeResolution, "id" | "created_at">): Promise<void> {
        const db = this.getClient();
        const { error } = await db.from("admin_dispute_resolutions").insert(resolution);
        if (error) {
            console.error(`[DB] Failed to log dispute resolution: ${error.message}`);
            throw new Error(`Failed to log dispute resolution: ${error.message}`);
        }
    }

    // ═══════════════════════════════════════
    //          WHATSAPP INTEGRATION
    // ═══════════════════════════════════════

    /** Find user by their WhatsApp phone number (digits only, no +) */
    async getUserByWhatsappPhone(phone: string): Promise<User | null> {
        try {
            const db = this.getClient();
            const clean = phone.replace(/[^0-9]/g, "");
            if (!clean) return null;
            const last10 = clean.length >= 10 ? clean.slice(-10) : clean;

            const { data, error } = await db
                .from("users")
                .select("*")
                .or(`whatsapp_phone.eq.${clean},whatsapp_phone.ilike.%${last10},whatsapp_id.eq.${clean},phone_number.eq.${clean},phone_number.ilike.%${last10}`)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();

            if (error) {
                console.warn(`[DB] getUserByWhatsappPhone warning: ${error.message}`);
                const { data: fallback } = await db
                    .from("users")
                    .select("*")
                    .or(`whatsapp_phone.eq.${clean},whatsapp_id.eq.${clean},phone_number.eq.${clean}`)
                    .order("created_at", { ascending: true })
                    .limit(1)
                    .maybeSingle();
                return fallback as User | null;
            }
            return data as User | null;
        } catch {
            return null;
        }
    }

    /**
     * Get or create a user who started with WhatsApp (no Telegram).
     * Uses phone as the unique identifier and derives a wallet.
     */
    async getOrCreateUserByPhone(phone: string): Promise<User> {
        const db = this.getClient();
        const clean = phone.replace(/[^0-9]/g, "");

        try {
            const existing = await this.getUserByWhatsappPhone(clean || phone);
            if (existing) return existing;
        } catch (_) {}

        // Find next wallet index to satisfy NOT NULL constraints (filter out synthetic test indexes >= 900000)
        let nextIndex = 1;
        let walletAddress: string | null = null;
        try {
            const { data: maxResult } = await db
                .from("users")
                .select("wallet_index")
                .not("wallet_index", "is", null)
                .lt("wallet_index", 900000)
                .order("wallet_index", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (maxResult && (maxResult as any).wallet_index) {
                nextIndex = (maxResult as any).wallet_index + 1;
            }

            const { wallet: walletSvc } = await import("../services/wallet");
            walletAddress = walletSvc.deriveWallet(nextIndex).address;
        } catch (_) {}

        // Synthetic negative telegram_id to satisfy DB NOT NULL/UNIQUE constraints for WA-only users
        const syntheticTelegramId = -Math.abs(Math.floor((Date.now() % 10000000) * 100) + Math.floor(Math.random() * 100));

        const insertPayload: Record<string, any> = {
            telegram_id:       syntheticTelegramId,
            username:          null,
            first_name:        `WA_${(clean || phone).slice(-4)}`,
            whatsapp_phone:    clean || phone,
            phone_number:      clean || phone,
            preferred_channel: "whatsapp",
            wallet_index:      nextIndex,
            wallet_address:    null,
            wallet_type:       "bot",
        };

        let { data: newUser, error } = await db
            .from("users")
            .insert(insertPayload)
            .select()
            .single();

        if (error && error.message.includes("preferred_channel")) {
            delete insertPayload.preferred_channel;
            const retry = await db.from("users").insert(insertPayload).select().single();
            newUser = retry.data;
            error = retry.error;
        }

        if (error && (error.message.includes("unique") || error.code === "23505")) {
            // Concurrency race condition or duplicate key: fetch existing user
            const fallbackUser = await this.getUserByWhatsappPhone(clean || phone);
            if (fallbackUser) return fallbackUser;
        }

        if (error || !newUser) throw new Error(`Failed to create WhatsApp user: ${error?.message}`);
        console.log(`[DB] Created unassigned WA user record for ${newUser.id} (phone=${clean || phone})`);
        return newUser as User;
    }

    /** Safely fetch the next available HD wallet index (excludes synthetic demo-merchant indexes >= 900000) */
    async getNextWalletIndex(): Promise<number> {
        const db = this.getClient();
        try {
            const { data: maxResult } = await db
                .from("users")
                .select("wallet_index")
                .not("wallet_index", "is", null)
                .lt("wallet_index", 900000)
                .order("wallet_index", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (maxResult && (maxResult as any).wallet_index) {
                return (maxResult as any).wallet_index + 1;
            }
        } catch (_) {}
        return 1;
    }

    /** Derive and assign a brand-new wallet to an existing wallet-less WA user */
    async assignWalletToWaUser(userId: string): Promise<User> {
        const db = this.getClient();

        // Check if user already has a wallet_address assigned
        const { data: existingUser } = await db
            .from("users")
            .select("*")
            .eq("id", userId)
            .maybeSingle();

        if (existingUser && existingUser.wallet_address) {
            console.log(`[DB] User ${userId} already has wallet ${existingUser.wallet_address}, preserving existing wallet.`);
            return existingUser as User;
        }

        let nextIndex = existingUser?.wallet_index;

        if (nextIndex === undefined || nextIndex === null) {
            const { data: maxResult } = await db
                .from("users")
                .select("wallet_index")
                .not("wallet_index", "is", null)
                .lt("wallet_index", 900000)
                .order("wallet_index", { ascending: false })
                .limit(1)
                .maybeSingle();

            nextIndex = ((maxResult as any)?.wallet_index ?? 0) + 1;
        }

        let walletAddress: string | null = null;
        try {
            const { wallet: walletSvc } = await import("../services/wallet");
            walletAddress = walletSvc.deriveWallet(nextIndex).address;
        } catch {
            throw new Error("Failed to derive wallet");
        }

        const { data: updated, error } = await db
            .from("users")
            .update({ wallet_index: nextIndex, wallet_address: walletAddress, wallet_type: "bot" })
            .eq("id", userId)
            .select()
            .single();

        if (error || !updated) throw new Error("Failed to assign wallet");
        console.log(`[DB] Assigned wallet ${walletAddress} (index=${nextIndex}) to WA user ${userId}`);

        return updated as User;
    }

    // ── WhatsApp Conversation State ──────────────────────────────────────────

    /** Save a transient conversation state for a user (replaces any existing state) */
    async setWhatsappState(userId: string, key: string, data: Record<string, any>): Promise<void> {
        const db = this.getClient();
        await db.from("whatsapp_states").upsert({
            user_id:    userId,
            key,
            data,
            updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
    }

    /** Get the current conversation state for a user */
    async getWhatsappState(userId: string): Promise<{ key: string; data: Record<string, any> } | null> {
        const db = this.getClient();
        const { data } = await db
            .from("whatsapp_states")
            .select("key, data")
            .eq("user_id", userId)
            .maybeSingle();
        return data ?? null;
    }

    /** Clear conversation state after a flow completes */
    async clearWhatsappState(userId: string): Promise<void> {
        const db = this.getClient();
        await db.from("whatsapp_states").delete().eq("user_id", userId);
    }

    /** Clear ALL WhatsApp conversation states */
    async clearAllWhatsappStates(): Promise<void> {
        const db = this.getClient();
        await db.from("whatsapp_states").delete().neq("user_id", "00000000-0000-0000-0000-000000000000");
    }

    // ── WhatsApp Account Linking ──────────────────────────────────────────────

    /** Generate a 6-digit OTP for account linking */
    async createWhatsappLinkCode(userId: string): Promise<string> {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const db = this.getClient();
        await db.from("whatsapp_states").upsert({
            user_id: userId,
            key: "LINK_CODE",
            data: { code, expires_at: Date.now() + 10 * 60 * 1000 },
            updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        return code;
    }

    /** Verify link code provided on WhatsApp and link phone to user account (handles account merging) */
    async linkWhatsappByCode(phone: string, inputCode: string): Promise<User | null> {
        const db = this.getClient();

        // Find state matching the OTP code
        const { data: states } = await db
            .from("whatsapp_states")
            .select("user_id, data")
            .eq("key", "LINK_CODE");

        if (!states) return null;

        const match = states.find((s: any) => s.data?.code === inputCode && s.data?.expires_at > Date.now());
        if (!match) return null;

        const targetUserId = match.user_id; // The Telegram user's ID

        // ── Check for a standalone WA-only account with this phone ────────────
        const { data: waOnlyUser } = await db
            .from("users")
            .select("*")
            .eq("whatsapp_phone", phone)
            .maybeSingle();

        if (waOnlyUser && waOnlyUser.id !== targetUserId) {
            // 🛡️ Safety Gate: Block merge if WA user has active escrow trades.
            // The smart contract escrow is tied to waOnlyUser's wallet private key.
            // Merging (and nulling) that wallet row while funds are locked would make
            // the relayer unable to release → permanent fund lock.
            const { data: activeWaTrades } = await db
                .from("trades")
                .select("id")
                .or(`buyer_id.eq.${waOnlyUser.id},seller_id.eq.${waOnlyUser.id}`)
                .in("status", ["matched", "in_escrow", "fiat_sent", "disputed"])
                .limit(1);

            if (activeWaTrades && activeWaTrades.length > 0) {
                console.warn(`[LINK] Blocking WA→TG merge for ${waOnlyUser.id}: active escrow trades exist.`);
                // Return null to signal the link failed — caller should show appropriate error
                return null;
            }

            // ── MERGE: Transfer all related records from WA account → Telegram account ──
            try { await db.from("orders").update({ user_id: targetUserId }).eq("user_id", waOnlyUser.id); } catch (_) {}
            try { await db.from("trades").update({ buyer_id: targetUserId }).eq("buyer_id", waOnlyUser.id); } catch (_) {}
            try { await db.from("trades").update({ seller_id: targetUserId }).eq("seller_id", waOnlyUser.id); } catch (_) {}
            try { await db.from("payment_proofs").update({ user_id: targetUserId }).eq("user_id", waOnlyUser.id); } catch (_) {}
            try { await db.from("user_ips").update({ user_id: targetUserId }).eq("user_id", waOnlyUser.id); } catch (_) {}
            try { await db.from("disputes").update({ raised_by: targetUserId }).eq("raised_by", waOnlyUser.id); } catch (_) {}
            try { await db.from("dispute_messages").update({ sender_id: targetUserId }).eq("sender_id", waOnlyUser.id); } catch (_) {}

            // ── If Telegram user has no wallet yet, inherit the WA wallet ─────
            const { data: telegramUser } = await db
                .from("users")
                .select("*")
                .eq("id", targetUserId)
                .single();

            const updatesFromWa: any = {};
            if (!telegramUser?.wallet_address && waOnlyUser.wallet_address) {
                updatesFromWa.wallet_address = waOnlyUser.wallet_address;
                updatesFromWa.wallet_index = waOnlyUser.wallet_index;
                updatesFromWa.wallet_type = "bot";
            }

            // 🛡️ KYC & Identity Inheritance
            if (waOnlyUser.is_verified || waOnlyUser.kyc_status === 'approved' || waOnlyUser.kyc_status === 'verified') {
                updatesFromWa.is_verified = true;
                updatesFromWa.kyc_status = 'approved';
                if (waOnlyUser.kyc_session_id) updatesFromWa.kyc_session_id = waOnlyUser.kyc_session_id;
                if (waOnlyUser.kyc_document_type) updatesFromWa.kyc_document_type = waOnlyUser.kyc_document_type;
                if (waOnlyUser.kyc_country) updatesFromWa.kyc_country = waOnlyUser.kyc_country;
                if (waOnlyUser.kyc_verified_at) updatesFromWa.kyc_verified_at = waOnlyUser.kyc_verified_at;
            }

            // 🏦 Payment details & ratings inheritance
            if (!telegramUser?.upi_id && waOnlyUser.upi_id) updatesFromWa.upi_id = waOnlyUser.upi_id;
            if (!telegramUser?.bank_account_number && waOnlyUser.bank_account_number) {
                updatesFromWa.bank_account_number = waOnlyUser.bank_account_number;
                updatesFromWa.bank_ifsc = waOnlyUser.bank_ifsc;
                updatesFromWa.bank_name = waOnlyUser.bank_name;
            }
            if ((telegramUser?.trade_count || 0) < (waOnlyUser.trade_count || 0)) {
                updatesFromWa.trade_count = waOnlyUser.trade_count;
                updatesFromWa.completed_trades = waOnlyUser.completed_trades;
            }

            // 👝 Linked Wallets Registry: Store both TG and WA wallets so user can switch between them
            const currentCache = (telegramUser as any)?.predictions_cache || {};
            const linkedWallets = currentCache.linked_wallets || {};

            if (telegramUser?.wallet_address && telegramUser?.wallet_index !== undefined) {
                linkedWallets.telegram = {
                    wallet_index: telegramUser.wallet_index,
                    wallet_address: telegramUser.wallet_address,
                };
            }
            if (waOnlyUser.wallet_address && waOnlyUser.wallet_index !== undefined) {
                linkedWallets.whatsapp = {
                    wallet_index: waOnlyUser.wallet_index,
                    wallet_address: waOnlyUser.wallet_address,
                };
            }
            updatesFromWa.predictions_cache = {
                ...currentCache,
                linked_wallets: linkedWallets
            };

            // ── Delete / clear the orphaned WA-only user row FIRST to release unique constraints ──────
            await db.from("whatsapp_states").delete().eq("user_id", waOnlyUser.id);
            await db.from("users").update({
                whatsapp_phone: null,
                telegram_id: null,
                wallet_index: null,
                wallet_address: null,
            }).eq("id", waOnlyUser.id);
            await db.from("users").delete().eq("id", waOnlyUser.id);

            if (Object.keys(updatesFromWa).length > 0) {
                await db.from("users").update(updatesFromWa).eq("id", targetUserId);
            }

            console.log(`[LINK] Merged WA-only user ${waOnlyUser.id} into Telegram user ${targetUserId}`);
        }

        // ── Update Telegram user with the linked phone ────────────────────────
        const { data: updatedUser, error } = await db
            .from("users")
            .update({
                whatsapp_phone:    phone,
                preferred_channel: "both",
                updated_at:        new Date().toISOString(),
            })
            .eq("id", targetUserId)
            .select()
            .single();

        if (error || !updatedUser) return null;

        // Clear link code state
        await db.from("whatsapp_states").delete().eq("user_id", targetUserId);

        return updatedUser as User;
    }

    /** Unlink WhatsApp account from user profile */
    async unlinkWhatsapp(userId: string): Promise<void> {
        const db = this.getClient();
        await db
            .from("users")
            .update({
                whatsapp_phone: null,
                preferred_channel: "telegram",
                updated_at: new Date().toISOString(),
            })
            .eq("id", userId);
    }

    /** Verify link code provided by Telegram user and link telegram_id/username to target user account */
    async linkTelegramByCode(
        telegramId: number | string,
        username: string | null,
        firstName: string | null,
        inputCode: string
    ): Promise<User | null> {
        const db = this.getClient();

        // Find state matching the OTP code
        const { data: states } = await db
            .from("whatsapp_states")
            .select("user_id, data")
            .eq("key", "LINK_CODE");

        if (!states) return null;

        const match = states.find((s: any) => s.data?.code === inputCode && s.data?.expires_at > Date.now());
        if (!match) return null;

        const targetUserId = match.user_id; // The Web user's ID

        // Check if there's already an existing Telegram-only user for this telegramId
        const { data: tgOnlyUser } = await db
            .from("users")
            .select("*")
            .eq("telegram_id", Number(telegramId))
            .maybeSingle();

        if (tgOnlyUser && tgOnlyUser.id !== targetUserId) {
            // 🛡️ Safety Gate: Block merge if TG user has active escrow trades.
            const { data: activeTgTrades } = await db
                .from("trades")
                .select("id")
                .or(`buyer_id.eq.${tgOnlyUser.id},seller_id.eq.${tgOnlyUser.id}`)
                .in("status", ["matched", "in_escrow", "fiat_sent", "disputed"])
                .limit(1);

            if (activeTgTrades && activeTgTrades.length > 0) {
                console.warn(`[LINK] Blocking TG→Target merge for ${tgOnlyUser.id}: active escrow trades exist.`);
                return null;
            }

            // MERGE: Transfer trades, orders, and payment proofs from TG account → Target account
            try { await db.from("orders").update({ user_id: targetUserId }).eq("user_id", tgOnlyUser.id); } catch (_) {}
            try { await db.from("trades").update({ buyer_id: targetUserId }).eq("buyer_id", tgOnlyUser.id); } catch (_) {}
            try { await db.from("trades").update({ seller_id: targetUserId }).eq("seller_id", tgOnlyUser.id); } catch (_) {}
            try { await db.from("payment_proofs").update({ user_id: targetUserId }).eq("user_id", tgOnlyUser.id); } catch (_) {}
            try { await db.from("user_ips").update({ user_id: targetUserId }).eq("user_id", tgOnlyUser.id); } catch (_) {}
            try { await db.from("disputes").update({ raised_by: targetUserId }).eq("raised_by", tgOnlyUser.id); } catch (_) {}
            try { await db.from("dispute_messages").update({ sender_id: targetUserId }).eq("sender_id", tgOnlyUser.id); } catch (_) {}

            // 💼 Wallet Priority: Only inherit TG wallet if the target (WA/web) user has NO wallet yet.
            // NEVER overwrite an existing wallet — the user's primary wallet must always be preserved.
            const { data: targetUser } = await db.from("users").select("*").eq("id", targetUserId).single();
            const updatesFromTg: any = {};

            if (tgOnlyUser.wallet_address && !targetUser?.wallet_address) {
                // Target has no wallet — safe to inherit from TG account
                updatesFromTg.wallet_address = tgOnlyUser.wallet_address;
                updatesFromTg.wallet_index = tgOnlyUser.wallet_index;
                updatesFromTg.wallet_type = tgOnlyUser.wallet_type || "bot";
                console.log(`[LINK] Inheriting TG wallet for ${targetUserId}: ${tgOnlyUser.wallet_address} (target had no wallet)`);
            } else if (tgOnlyUser.wallet_address && targetUser?.wallet_address) {
                // Target already has a wallet — do NOT overwrite it, just log
                console.log(`[LINK] Preserving existing wallet for ${targetUserId}: ${targetUser.wallet_address} (TG wallet ${tgOnlyUser.wallet_address} NOT applied)`);
            }

            // 👝 Linked Wallets Registry: Store both TG and WA wallets so user can switch between them
            const currentCache = (targetUser as any)?.predictions_cache || {};
            const linkedWallets = currentCache.linked_wallets || {};

            if (tgOnlyUser.wallet_address && tgOnlyUser.wallet_index !== undefined) {
                linkedWallets.telegram = {
                    wallet_index: tgOnlyUser.wallet_index,
                    wallet_address: tgOnlyUser.wallet_address,
                };
            }
            if (targetUser?.wallet_address && targetUser?.wallet_index !== undefined) {
                linkedWallets.whatsapp = {
                    wallet_index: targetUser.wallet_index,
                    wallet_address: targetUser.wallet_address,
                };
            }
            updatesFromTg.predictions_cache = {
                ...currentCache,
                linked_wallets: linkedWallets
            };

            // 🛡️ KYC & Identity Inheritance: Carry over verified KYC status if Telegram user completed it
            if (tgOnlyUser.is_verified || tgOnlyUser.kyc_status === 'approved' || tgOnlyUser.kyc_status === 'verified') {
                updatesFromTg.is_verified = true;
                updatesFromTg.kyc_status = 'approved';
                if (tgOnlyUser.kyc_session_id) updatesFromTg.kyc_session_id = tgOnlyUser.kyc_session_id;
                if (tgOnlyUser.kyc_document_type) updatesFromTg.kyc_document_type = tgOnlyUser.kyc_document_type;
                if (tgOnlyUser.kyc_country) updatesFromTg.kyc_country = tgOnlyUser.kyc_country;
                if (tgOnlyUser.kyc_verified_at) updatesFromTg.kyc_verified_at = tgOnlyUser.kyc_verified_at;
            }

            // 🏦 Payment details & ratings inheritance if not already set on web
            if (!targetUser?.upi_id && tgOnlyUser.upi_id) updatesFromTg.upi_id = tgOnlyUser.upi_id;
            if (!targetUser?.bank_account_number && tgOnlyUser.bank_account_number) {
                updatesFromTg.bank_account_number = tgOnlyUser.bank_account_number;
                updatesFromTg.bank_ifsc = tgOnlyUser.bank_ifsc;
                updatesFromTg.bank_name = tgOnlyUser.bank_name;
            }
            if ((targetUser?.trade_count || 0) < (tgOnlyUser.trade_count || 0)) {
                updatesFromTg.trade_count = tgOnlyUser.trade_count;
                updatesFromTg.completed_trades = tgOnlyUser.completed_trades;
            }

            // Clear old row first to avoid duplicate key constraint collisions on wallet_index/wallet_address/telegram_id
            await db.from("whatsapp_states").delete().eq("user_id", tgOnlyUser.id);
            await db.from("users").update({
                telegram_id: null,
                username: null,
                wallet_index: null,
                wallet_address: null,
            }).eq("id", tgOnlyUser.id);
            await db.from("users").delete().eq("id", tgOnlyUser.id);

            // Now apply updates to targetUserId
            if (Object.keys(updatesFromTg).length > 0) {
                await db.from("users").update(updatesFromTg).eq("id", targetUserId);
            }
        }

        // Update target user with Telegram credentials
        const updates: any = {
            telegram_id: Number(telegramId),
            preferred_channel: "both",
            updated_at: new Date().toISOString(),
        };
        if (username) updates.username = username;
        if (firstName) updates.first_name = firstName;

        const { data: updatedUser, error } = await db
            .from("users")
            .update(updates)
            .eq("id", targetUserId)
            .select()
            .single();

        if (error || !updatedUser) {
            console.error("[linkTelegramByCode] Update error:", error);
            return null;
        }

        // Clear link code state
        await db.from("whatsapp_states").delete().eq("user_id", targetUserId);

        return updatedUser as User;
    }

    /** Unlink Telegram account from user profile */
    async unlinkTelegram(userId: string): Promise<void> {
        const db = this.getClient();
        // Reset telegram_id to null or a negative synthetic placeholder
        const dummyTgId = -Math.floor(100000000 + Math.random() * 900000000);
        await db
            .from("users")
            .update({
                telegram_id: dummyTgId,
                username: null,
                preferred_channel: "whatsapp",
                updated_at: new Date().toISOString(),
            })
            .eq("id", userId);
    }

    // ── WhatsApp Group Registry ───────────────────────────────────────────────

    /** Register a WhatsApp group JID for ad broadcasts (idempotent) */
    async registerBroadcastGroup(groupJid: string, groupName: string): Promise<void> {
        const db = this.getClient();
        await db.from("whatsapp_groups").upsert(
            { group_jid: groupJid, group_name: groupName, active: true, updated_at: new Date().toISOString() },
            { onConflict: "group_jid" }
        );
    }

    /** Get all active groups registered for broadcasting */
    async getRegisteredBroadcastGroups(): Promise<{ group_jid: string; group_name: string }[]> {
        const db = this.getClient();
        const { data } = await db
            .from("whatsapp_groups")
            .select("group_jid, group_name")
            .eq("active", true);
        return data ?? [];
    }

    // ── Additional helpers needed by WA handlers (new — not duplicates) ────────

    async getOrdersByUserId(userId: string): Promise<any[]> {
        const db = this.getClient();
        const { data } = await db
            .from("orders")
            .select("*")
            .eq("user_id", userId)
            .in("status", ["active", "paused"])
            .order("created_at", { ascending: false })
            .limit(20);
        return data ?? [];
    }

    async pauseOrder(orderId: string, userId: string): Promise<void> {
        const db = this.getClient();
        const { error } = await db
            .from("orders")
            .update({ status: "paused" })
            .eq("id", orderId)
            .eq("user_id", userId);
        if (error) throw new Error(error.message);
    }

    async getActiveTradesForUser(userId: string): Promise<any[]> {
        const db = this.getClient();
        const { data } = await db
            .from("trades")
            .select("*")
            .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
            .not("status", "in", '("completed","cancelled","refunded","expired")')
            .order("created_at", { ascending: false })
            .limit(10);
        return data ?? [];
    }

    async cancelTrade(tradeId: string, userId: string): Promise<void> {
        const db = this.getClient();
        // 🛡️ Status gate: only allow cancellation before fiat has been sent.
        // Once a buyer has marked payment, cancellation must go through admin dispute.
        const { data: trade } = await db
            .from("trades")
            .select("id, status, buyer_id, seller_id")
            .eq("id", tradeId)
            .maybeSingle();

        if (!trade) throw new Error("Trade not found.");

        const isParty = trade.buyer_id === userId || trade.seller_id === userId;
        if (!isParty) throw new Error("You are not a party to this trade.");

        const cancellableStatuses = ["matched", "in_escrow"];
        if (!cancellableStatuses.includes(trade.status)) {
            throw new Error(
                trade.status === "fiat_sent"
                    ? "Cannot cancel after buyer has marked payment. Open a dispute instead."
                    : `Cannot cancel a trade in '${trade.status}' status.`
            );
        }

        const { error } = await db
            .from("trades")
            .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
            .eq("id", tradeId)
            .in("status", cancellableStatuses);
        if (error) throw new Error(error.message);
    }

    async getAllUsers(): Promise<User[]> {
        const db = this.getClient();
        const { data } = await db.from("users").select("*");
        return (data ?? []) as User[];
    }
}

export const db = new Database();
