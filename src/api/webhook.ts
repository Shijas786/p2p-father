import { Router, Request, Response } from "express";
import { db } from "../db/client";

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
        // 🛡️ Security Guard: If DEPOSIT_WEBHOOK_SECRET is set, reject unauthorized calls
        const depositSecret = process.env.DEPOSIT_WEBHOOK_SECRET;
        if (depositSecret) {
            const incomingSecret = (req.headers["x-webhook-secret"] as string) || (req.query.secret as string);
            if (incomingSecret !== depositSecret) {
                console.warn(`[DepositWebhook] ⛔ Unauthorized call rejected from IP=${req.ip}`);
                return res.status(403).json({ error: "Forbidden: Unauthorized deposit webhook" });
            }
        }

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
