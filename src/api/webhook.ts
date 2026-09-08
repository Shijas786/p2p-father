import { Router, Request, Response } from "express";
import { db } from "../db/client";
import { CopyTradingService } from "../services/copy-trading";

export const webhookRouter = Router();

/**
 * In-memory deduplication cache for processed deposit notifications
 * key: txHash_walletAddress
 */
const processedDeposits = new Set<string>();

async function notifyWaUserDeposit(params: {
    toAddress: string;
    amount: string | number;
    token?: string;
    chain?: string;
    txHash: string;
}): Promise<boolean> {
    const { toAddress, amount, txHash } = params;
    if (!toAddress || !txHash) return false;

    // Deduplication check
    const dedupKey = `${txHash.toLowerCase()}_${toAddress.toLowerCase()}`;
    if (processedDeposits.has(dedupKey)) {
        console.log(`[DepositWebhook] Skipping duplicate tx ${dedupKey}`);
        return false;
    }
    processedDeposits.add(dedupKey);

    // Keep cache bounded
    if (processedDeposits.size > 5000) {
        const first = processedDeposits.values().next().value;
        if (first) processedDeposits.delete(first);
    }

    try {
        // Resolve user by wallet_address
        const { data: user, error } = await db.getClient()
            .from("users")
            .select("*")
            .ilike("wallet_address", toAddress)
            .maybeSingle();

        if (error || !user) {
            console.log(`[DepositWebhook] No user found for wallet ${toAddress}`);
            return false;
        }

        // STRICT REQUIREMENT: WhatsApp bot only
        if (!user.whatsapp_phone) {
            console.log(`[DepositWebhook] User ${user.id} does not have whatsapp_phone, skipping alert.`);
            return false;
        }

        const rawChain = (params.chain || "bsc").toLowerCase();
        const chainNorm = rawChain.includes("base") ? "base" : "bsc";
        const explorerUrl = chainNorm === "bsc"
            ? `https://bscscan.com/tx/${txHash}`
            : `https://basescan.org/tx/${txHash}`;

        const formattedAmount = typeof amount === "number" ? amount.toFixed(2) : parseFloat(String(amount) || "0").toFixed(2);
        const cleanToken = (params.token || "USDT").toUpperCase();
        const cleanChain = chainNorm.toUpperCase();
        const shortWallet = user.wallet_address
            ? `\`${user.wallet_address.slice(0, 6)}...${user.wallet_address.slice(-4)}\``
            : `\`${toAddress.slice(0, 6)}...${toAddress.slice(-4)}\``;

        const message = `💰 *DEPOSIT RECEIVED!* ⚡

Your deposit has arrived on *${cleanChain}*!

• *Amount:* ${formattedAmount} ${cleanToken}
• *Network:* ${cleanChain}
• *Wallet:* ${shortWallet}
• *Tx Hash:*
👉 ${explorerUrl}

Funds are now in your wallet and ready to trade! Type /balance to view your balance.`;

        const { hypermeowClient } = await import("../whatsapp/hypermeowClient");
        const phone = String(user.whatsapp_phone).replace("+", "").trim();
        const jid = `${phone}@s.whatsapp.net`;

        await hypermeowClient.sendButtons(
            jid,
            message,
            [
                { id: "/balance",      label: "💰 View Balance" },
                { id: "vault_deposit", label: "🔒 Lock to Vault" },
                { id: "/post",         label: "➕ Post Ad" },
            ]
        );

        console.log(`[DepositWebhook] ✅ Sent WhatsApp deposit alert to ${phone} for ${formattedAmount} ${cleanToken} on ${cleanChain}`);
        return true;
    } catch (err: any) {
        console.error(`[DepositWebhook] Error processing deposit for ${toAddress}:`, err?.message || err);
        return false;
    }
}

/**
 * POST /api/webhook/deposit
 * Receives incoming deposit webhooks (Alchemy Address Activity or direct payload)
 * and dispatches instant WhatsApp-only alerts with 0 RPC calls.
 */
webhookRouter.post("/deposit", async (req: Request, res: Response) => {
    try {
        const body = req.body;

        // 1. Alchemy Address Activity Webhook payload
        if (body?.event && Array.isArray(body.event.activity)) {
            const networkRaw = (body.event.network || "BNB_MAINNET").toLowerCase();
            const chain = networkRaw.includes("base") ? "base" : "bsc";

            let notifiedCount = 0;
            for (const act of body.event.activity) {
                const ok = await notifyWaUserDeposit({
                    toAddress: act.toAddress,
                    amount: act.value,
                    token: act.asset || "USDT",
                    chain: chain,
                    txHash: act.hash,
                });
                if (ok) notifiedCount++;
            }
            return res.json({ success: true, processed: body.event.activity.length, notified: notifiedCount });
        }

        // 2. Direct / Custom webhook payload
        const toAddress = body.to || body.toAddress || body.wallet_address || body.address;
        const txHash = body.txHash || body.hash || body.transactionHash;
        const amount = body.amount ?? body.value ?? "0";
        const token = body.token || body.asset || "USDT";
        const chain = body.chain || body.network || "bsc";

        if (!toAddress || !txHash) {
            return res.status(400).json({ error: "Missing required fields: toAddress/to and txHash/hash" });
        }

        const ok = await notifyWaUserDeposit({ toAddress, amount, token, chain, txHash });
        return res.json({ success: ok });
    } catch (err: any) {
        console.error("[DepositWebhook] Handler error:", err?.message || err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// Middleware to verify webhook secret for sensitive internal webhooks (e.g. copy-trade)
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
