/**
 * WhatsApp Trade Handler
 * Handles: trade_ad_<id>, /paid_<id>, /release_<id>, /dispute_<id>, /cancel_<id>
 */

import type { WASocket, IWebMessageInfo } from "../types";
import type { User } from "../../types";
import { db } from "../../db/client";
import { escrow } from "../../services/escrow";
import { reply, replyWithButtons } from "../router";
import {
    fmtTradeStarted,
    fmtEscrowLocked,
    fmtPaymentMarked,
    fmtTradeReleased,
    fmtDisputeOpened,
} from "../formatters";
import { sendUserAlert } from "../../services/notifier";

export async function handleTradeCommand(
    sock: WASocket,
    msg: IWebMessageInfo,
    jid: string,
    user: User,
    text: string
): Promise<void> {
    // ─── Deep link: trade_ad_<orderId> — User wants to trade on an ad ─────────
    if (text.startsWith("trade_ad_")) {
        const orderId = text.replace("trade_ad_", "").trim();

        let order: any;
        try {
            order = await db.getOrderById(orderId);
        } catch {
            await reply(sock, jid, "❌ Ad not found or has expired.", msg);
            return;
        }

        if (!order || order.status !== "active") {
            await reply(sock, jid, "❌ This ad is no longer active.", msg);
            return;
        }

        if (order.user_id === user.id) {
            await reply(sock, jid, "❌ You cannot trade with your own ad.", msg);
            return;
        }

        // Determine buyer/seller roles
        const isBuyer = order.type === "sell"; // If ad is SELL, the initiator is the BUYER
        const sellerUserId  = isBuyer ? order.user_id : user.id;
        const buyerUserId   = isBuyer ? user.id : order.user_id;

        await replyWithButtons(
            sock,
            jid,
            `💱 *TRADE PREVIEW*

• *Type:* ${isBuyer ? "You BUY USDT" : "You SELL USDT"}
• *Rate:* ₹${order.rate} / USDT
• *Min:* ₹${order.min_amount} | *Max:* ₹${order.max_amount}
• *Payment:* ${(order.payment_methods ?? []).join(", ")}

Enter the fiat amount (₹) you want to trade:
_(e.g. type \`5000\` for ₹5,000 → ${(5000 / order.rate).toFixed(2)} USDT)_`,
            [{ id: `cancel_preview_${orderId}`, label: "❌ Cancel" }]
        );

        // Save pending trade initiation state
        await (db as any).setWhatsappState(user.id, "AWAITING_TRADE_AMOUNT", {
            order_id:      orderId,
            buyer_user_id: buyerUserId,
            seller_user_id: sellerUserId,
            is_buyer:      isBuyer,
            rate:          order.rate,
            payment_method: (order.payment_methods ?? [])[0] ?? "UPI",
        });
        return;
    }

    // ─── /trades — List active trades ─────────────────────────────────────────
    if (text === "/trades") {
        const trades = await db.getActiveTradesForUser(user.id);
        if (trades.length === 0) {
            await replyWithButtons(sock, jid, "📋 *No active trades.*\n\nBrowse ads to start trading!", [
                { id: "/ads", label: "📊 Browse Ads" },
            ]);
            return;
        }

        const lines = trades.slice(0, 5).map((t: any, i: number) => {
            const role = t.buyer_id === user.id ? "BUYER" : "SELLER";
            return `${i + 1}. *${role}* | ${t.amount} USDT @ ₹${t.rate} | *${t.status.toUpperCase()}*\n   /release_${t.id} | /dispute_${t.id}`;
        });

        await reply(sock, jid, `📋 *YOUR ACTIVE TRADES*\n\n${lines.join("\n\n")}`, msg);
        return;
    }

    // ─── /paid_<tradeId> — Buyer marks payment sent ───────────────────────────
    if (text.startsWith("/paid_")) {
        const tradeId = text.replace("/paid_", "").trim();
        const trade = await db.getTradeById(tradeId);

        if (!trade) {
            await reply(sock, jid, "❌ Trade not found.", msg);
            return;
        }

        if (trade.buyer_id !== user.id) {
            await reply(sock, jid, "❌ Only the buyer can mark payment.", msg);
            return;
        }

        try {
            await db.updateTrade(tradeId, {
                status: "fiat_sent",
                fiat_sent_at: new Date().toISOString(),
            });

            await reply(
                sock,
                jid,
                `✅ *Payment Marked as Sent!*

The seller has been notified to check their bank account/UPI.

⏳ If seller doesn't release within 30 minutes, you can tap /dispute_${trade.id} to escalate to admins.`,
                msg
            );

            // Notify seller on WhatsApp/Telegram
            const seller = await db.getUserById(trade.seller_id);
            if (seller) {
                await sendUserAlert(seller, fmtPaymentMarked(trade));
            }

        } catch (err) {
            await reply(sock, jid, "❌ Failed to mark payment. Please try again.", msg);
        }
        return;
    }

    // ─── /release_<tradeId> — Seller releases crypto (with PIN) ──────────────
    if (text.startsWith("/release_")) {
        const tradeId = text.replace("/release_", "").trim();
        const trade   = await db.getTradeById(tradeId);

        if (!trade) {
            await reply(sock, jid, "❌ Trade not found.", msg);
            return;
        }

        if (trade.seller_id !== user.id) {
            await reply(sock, jid, "❌ Only the seller can release crypto.", msg);
            return;
        }

        if (trade.status === "completed") {
            await reply(sock, jid, "✅ This trade is already completed.", msg);
            return;
        }

        // Ask for PIN before releasing
        await reply(
            sock,
            jid,
            `🔓 *CONFIRM CRYPTO RELEASE*

You are about to release *${trade.amount} USDT* to the buyer.

⚠️ Only proceed if you confirmed receiving *₹${trade.fiat_amount}* in your bank/UPI.

Enter your *4-digit security PIN* to confirm release:`,
            msg
        );

        await (db as any).setWhatsappState(user.id, "AWAITING_RELEASE_PIN", { trade_id: tradeId });
        return;
    }

    // ─── /dispute_<tradeId> — Open dispute (requires 30m wait or issue) ──────
    if (text.startsWith("/dispute_")) {
        const tradeId = text.replace("/dispute_", "").trim();
        const trade   = await db.getTradeById(tradeId);

        if (!trade) {
            await reply(sock, jid, "❌ Trade not found.", msg);
            return;
        }

        // Check 30-minute rule
        const createdAt = new Date(trade.created_at).getTime();
        const minutesElapsed = (Date.now() - createdAt) / (1000 * 60);

        if (minutesElapsed < 30 && trade.status !== "fiat_sent") {
            const remaining = Math.ceil(30 - minutesElapsed);
            await reply(
                sock,
                jid,
                `⏳ *Dispute Cooldown Active*

Disputes can be raised after *30 minutes* if there is an issue.
Please wait *${remaining} more minute(s)* or contact the counterparty.`,
                msg
            );
            return;
        }

        try {
            await db.updateTrade(tradeId, { status: "disputed", dispute_reason: "Raised via WhatsApp bot" });

            // Sync dispute on-chain if contract trade
            if (trade.on_chain_trade_id) {
                try {
                    await escrow.raiseDispute(trade.on_chain_trade_id, "Dispute via WA Bot", trade.chain as any);
                } catch (e: any) {
                    console.error("[WA] On-chain dispute error:", e.message);
                }
            }

            await reply(sock, jid, fmtDisputeOpened(trade), msg);

            // Notify counterparty
            const otherUserId = trade.buyer_id === user.id ? trade.seller_id : trade.buyer_id;
            const otherUser   = await db.getUserById(otherUserId);
            if (otherUser) {
                await sendUserAlert(otherUser, `⚠️ *DISPUTE OPENED* on Trade \`${trade.id.slice(0, 8)}\` by counterparty. Admin team is reviewing.`);
            }

            // PING Telegram Admins with decision resolution buttons
            await alertAdminsDisputeOpened(trade);

        } catch (err) {
            await reply(sock, jid, "❌ Failed to open dispute. Contact @P2PFatherSupport", msg);
        }
        return;
    }


    // ─── /cancel_<tradeId> ────────────────────────────────────────────────────
    if (text.startsWith("/cancel_")) {
        const tradeId = text.replace("/cancel_", "").trim();
        try {
            await db.cancelTrade(tradeId, user.id);
            await reply(sock, jid, "❌ Trade cancelled successfully.", msg);
        } catch (err) {
            await reply(sock, jid, "❌ Cannot cancel this trade. Contact support.", msg);
        }
    }

    // ─── Handle state: fiat amount input for trade initiation ─────────────────
    const state = await (db as any).getWhatsappState(user.id);
    if (state?.key === "AWAITING_TRADE_AMOUNT") {
        const fiatAmount = parseFloat(text);
        if (isNaN(fiatAmount) || fiatAmount <= 0) {
            await reply(sock, jid, "❌ Enter a valid ₹ amount (e.g. `5000`)", msg);
            return;
        }

        const data = state.data;
        const usdtAmount = fiatAmount / data.rate;

        await replyWithButtons(
            sock,
            jid,
            `📋 *CONFIRM TRADE*

• *You ${data.is_buyer ? "BUY" : "SELL"}:* ${usdtAmount.toFixed(2)} USDT
• *You pay:* ₹${fiatAmount}
• *Rate:* ₹${data.rate}
• *Payment:* ${data.payment_method}

Proceed to lock escrow?`,
            [
                { id: `confirm_trade_${data.order_id}_${fiatAmount}`, label: "✅ Lock Escrow" },
                { id: "cancel_trade", label: "❌ Cancel" },
            ]
        );
        return;
    }

    // ─── Handle state: Security PIN verification for crypto release ────────────
    if (state?.key === "AWAITING_RELEASE_PIN") {
        const pin = text.trim();
        const tradeId = state.data?.trade_id;
        const trade = await db.getTradeById(tradeId);

        if (!trade) {
            await reply(sock, jid, "❌ Trade session expired.", msg);
            await (db as any).clearWhatsappState(user.id);
            return;
        }

        // Verify PIN (if set on user account)
        if (user.security_pin && user.security_pin !== pin) {
            await reply(sock, jid, "❌ Incorrect 4-digit security PIN. Please try again:", msg);
            return;
        }

        try {
            await reply(sock, jid, "⏳ Releasing funds on blockchain... Please wait.", msg);

            let txHash = trade.escrow_tx_hash || "0x_relayer_release";
            if (trade.on_chain_trade_id) {
                try {
                    const { escrow } = await import("../../services/escrow");
                    txHash = await escrow.release(trade.on_chain_trade_id);
                } catch (e: any) {
                    console.error("[WA-Release] Escrow release error:", e.message);
                }
            }

            await db.updateTrade(tradeId, { status: "completed", escrow_tx_hash: txHash });
            await (db as any).clearWhatsappState(user.id);

            await reply(
                sock,
                jid,
                `✅ *CRYPTO RELEASED SUCCESSFULLY!* 🎉

*Trade ID:* \`${trade.id.slice(0, 8)}\`
*Amount Released:* ${trade.amount} ${trade.token}

Thank you for trading on P2PFather!`,
                msg
            );

            // Notify buyer
            const buyer = await db.getUserById(trade.buyer_id);
            if (buyer) {
                await sendUserAlert(buyer, `🎉 *USDT RECEIVED!* \n\nSeller released *${trade.amount} USDT* for Trade \`${trade.id.slice(0, 8)}\`. Funds are in your wallet!`);
            }

        } catch (err) {
            await reply(sock, jid, "❌ Release failed. Contact @P2PFatherSupport", msg);
        }
        return;
    }
}

/** Helper: Alert Telegram admins with inline resolution buttons when a dispute is opened */
async function alertAdminsDisputeOpened(trade: any): Promise<void> {
    try {
        const { bot } = await import("../../bot");
        const { env } = await import("../../config/env");
        const { InlineKeyboard } = await import("grammy");

        const msg = 
`🚨 *NEW DISPUTE RAISED (WHATSAPP)* 🚨

• *Trade ID:* \`${trade.id}\`
• *Amount:* ${trade.amount} ${trade.token} (₹${trade.fiat_amount})
• *Chain:* ${trade.chain?.toUpperCase() ?? "BSC"}
• *Buyer ID:* \`${trade.buyer_id.slice(0, 8)}\`
• *Seller ID:* \`${trade.seller_id.slice(0, 8)}\`

Please review payment evidence and choose resolution below:`;

        const kb = new InlineKeyboard()
            .text("⚖️ Resolve (Release to Buyer)", `resolve:${trade.id}:buyer`).row()
            .text("🔁 Resolve (Refund to Seller)", `resolve:${trade.id}:seller`).row()
            .text("🤖 AI Analysis", `ai_analyze_dispute:${trade.id}`);

        for (const adminId of env.ADMIN_IDS) {
            try {
                await bot.api.sendMessage(adminId, msg, { parse_mode: "Markdown", reply_markup: kb });
            } catch (e) {
                console.error(`[WA-Admin-Dispute] Failed to notify admin ${adminId}:`, e);
            }
        }
    } catch (e) {
        console.error("[WA-Admin-Dispute] Failed to trigger admin dispute alert:", e);
    }
}


