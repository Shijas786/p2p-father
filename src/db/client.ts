import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env";
import type { User, Order, Trade, PaymentProof } from "../types";

class Database {
    private client: SupabaseClient | null = null;

    private getClient(): SupabaseClient {
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
                await db
                    .from("users")
                    .update({ username, first_name: firstName, updated_at: new Date().toISOString() })
                    .eq("telegram_id", telegramId);
            }
            return existing as User;
        }

        // Create new user (wallet_index is handled by DB sequence/default)
        const { data: newUser, error } = await db
            .from("users")
            .insert({
                telegram_id: telegramId,
                username: username || null,
                first_name: firstName || null
            })
            .select()
            .single();

        if (error) throw new Error(`Failed to create user: ${error.message}`);
        return newUser as User;
    }

    async getUserByTelegramId(telegramId: number): Promise<User | null> {
        const db = this.getClient();
        const { data } = await db
            .from("users")
            .select("*")
            .eq("telegram_id", telegramId)
            .single();
        return data as User | null;
    }

    async getUserById(userId: string): Promise<User | null> {
        const db = this.getClient();
        const { data } = await db
            .from("users")
            .select("*")
            .eq("id", userId)
            .single();
        return data as User | null;
    }

    async updateUser(userId: string, updates: Partial<User>): Promise<void> {
        const db = this.getClient();
        await db
            .from("users")
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq("id", userId);
    }

    async completeUserTrade(userId: string, isSuccessful: boolean): Promise<void> {
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

        await this.updateUser(userId, {
            trade_count: newTradeCount,
            completed_trades: newCompletedCount,
            trust_score: newTrust
        });
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

    async getActiveOrders(type?: string, token?: string, limit = 20): Promise<Order[]> {
        const db = this.getClient();
        let query = db
            .from("orders")
            .select("*, users!inner(username, trust_score, completed_trades, wallet_address)")
            .eq("status", "active")
            .order("rate", { ascending: type === "sell" })
            .limit(limit);

        if (token && token !== "all") {
            query = query.eq("token", token);
        }

        if (type) {
            query = query.eq("type", type);
        }



        const { data, error } = await query;
        if (error) throw new Error(`Failed to get orders: ${error.message}`);

        return (data || []).map((d: any) => ({
            ...d,
            username: d.users?.username,
            trust_score: d.users?.trust_score,
            wallet_address: d.users?.wallet_address,
        })) as Order[];
    }

    async getOrderById(orderId: string): Promise<Order | null> {
        const db = this.getClient();
        const { data, error } = await db
            .from("orders")
            .select("*, users!inner(username, trust_score, upi_id)")
            .eq("id", orderId)
            .single();
        if (error) {
            console.error(`[DB] getOrderById error: ${error.message} (id: ${orderId})`);
            return null; // Or throw if prefer 404 behavior or actual 500
        }
        if (!data) return null;
        return {
            ...data,
            username: data.users?.username,
            trust_score: data.users?.trust_score,
            upi_id: data.users?.upi_id,
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
                .select("filled_amount, amount")
                .eq("id", orderId)
                .single();

            if (!order) return;

            const oldFilled = parseFloat(order.filled_amount.toString());
            const newFilled = Math.max(0, oldFilled - amount);

            const { data } = await db
                .from("orders")
                .update({
                    filled_amount: newFilled,
                    status: "active", // Always set back to active if we are reverting a fill
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
            .select("*")
            .eq("id", tradeId)
            .single();
        return data as Trade | null;
    }

    async getUserTrades(userId: string, limit = 10): Promise<Trade[]> {
        const db = this.getClient();
        const { data } = await db
            .from("trades")
            .select("*")
            .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
            .order("created_at", { ascending: false })
            .limit(limit);
        return (data || []) as Trade[];
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

    async recordFee(tradeId: string, amount: number, txHash?: string): Promise<void> {
        const db = this.getClient();
        await db.from("fees").insert({
            trade_id: tradeId,
            amount,
            token: "USDC",
            chain: "base",
            tx_hash: txHash,
        });
    }

    async getTotalFees(): Promise<number> {
        const db = this.getClient();
        const { data } = await db.from("fees").select("amount");
        return (data || []).reduce((sum: number, f: any) => sum + f.amount, 0);
    }

    // ═══════════════════════════════════════
    //              STATS
    // ═══════════════════════════════════════

    async getStats() {
        const db = this.getClient();
        const [trades, orders, users, fees, disputes] = await Promise.all([
            db.from("trades").select("id, status, amount", { count: "exact" }),
            db.from("orders").select("id", { count: "exact" }).eq("status", "active"),
            db.from("users").select("id", { count: "exact" }),
            this.getTotalFees(),
            db.from("trades").select("id", { count: "exact" }).eq("status", "disputed"),
        ]);

        const completedTrades = (trades.data || []).filter(
            (t: any) => t.status === "completed"
        );
        const totalVolume = completedTrades.reduce(
            (sum: number, t: any) => sum + (t.amount || 0),
            0
        );

        return {
            total_trades: trades.count || 0,
            completed_trades: completedTrades.length,
            active_orders: orders.count || 0,
            total_users: users.count || 0,
            total_volume_usdc: totalVolume,
            total_fees_collected: fees,
            active_disputes: disputes.count || 0,
        };
    }
}

export const db = new Database();
