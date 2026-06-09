import { Router, Request, Response } from "express";
import { db } from "../db/client";
import { CopyTradingService } from "../services/copy-trading";

export const webhookRouter = Router();

// Middleware to verify webhook secret
webhookRouter.use((req, res, next) => {
    const secret = req.headers['x-webhook-secret'];
    const expectedSecret = process.env.WEBHOOK_SECRET || "P2P_WEBHOOK_SECRET_123";

    if (!secret || secret !== expectedSecret) {
        return res.status(401).json({ error: "Unauthorized: Invalid or missing x-webhook-secret header" });
    }
    next();
});

/**
 * POST /api/webhook/copy-trade
 * Called by external bot immediately after a Polymarket trade is placed.
 */
webhookRouter.post("/copy-trade", async (req: Request, res: Response) => {
    try {
        const { telegram_id, token_id, amount_usdc, price, outcome, side, clob_trade_id } = req.body;

        if (!telegram_id || !token_id || !amount_usdc || !price || !outcome || !side) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // 1. Resolve lead user
        const { data: leadUser, error: userErr } = await db.getClient()
            .from("users")
            .select("id, telegram_id, username, deposit_wallet_address, wallet_index")
            .eq("telegram_id", telegram_id)
            .single();

        if (userErr || !leadUser) {
            return res.status(404).json({ error: "Lead user not found" });
        }

        // 2. Optimistically insert trade into prediction_trades
        const tradeId = clob_trade_id || `ext-${Date.now()}`;
        try {
            await db.getClient().from("prediction_trades").insert({
                user_id: leadUser.id,
                telegram_id: leadUser.telegram_id,
                username: leadUser.username,
                proxy_address: leadUser.deposit_wallet_address || '',
                clob_trade_id: tradeId,
                condition_id: "external_market", // Can be synced correctly later
                token_id: token_id,
                outcome: outcome,
                side: side,
                price: parseFloat(price),
                shares: parseFloat(amount_usdc) / parseFloat(price),
                cost_usdc: parseFloat(amount_usdc),
                traded_at: new Date().toISOString()
            });
            console.log(`[Webhook] Inserted external trade ${tradeId} for user ${telegram_id}`);
        } catch (insertErr: any) {
            console.warn(`[Webhook] Failed to insert external trade (might already exist):`, insertErr.message);
        }

        // 3. Trigger Copy Trades
        // Note: triggerCopyTrades runs asynchronously in the background.
        CopyTradingService.triggerCopyTrades(
            leadUser.telegram_id,
            token_id,
            parseFloat(amount_usdc),
            parseFloat(price),
            outcome,
            side
        ).catch((copyErr) => console.error("[Webhook] Replicate trigger error:", copyErr));

        return res.json({ success: true, message: "Copy trade triggered successfully" });

    } catch (err: any) {
        console.error("[Webhook] Error processing copy-trade:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
});
