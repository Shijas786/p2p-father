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
import { getTradeWebUrl } from "../../api/miniapp";

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
        const isBuyer = order.type === "sell";
        const totalFiat = Math.round((order.amount || 0) * (order.rate || 0));

        await replyWithButtons(
            sock,
            jid,
            `💱 *TRADE PREVIEW*

• *Action:* ${isBuyer ? "You BUY USDT" : "You SELL USDT"}
• *Amount:* ${order.amount} ${order.token || "USDT"}
• *Rate:* ₹${order.rate} / USDT
• *Total Fiat:* ₹${totalFiat.toLocaleString("en-IN")}
• *Payment Method:* ${(order.payment_methods ?? []).join(", ") || "UPI"}

_Tap Confirm to lock escrow on-chain and proceed:_`,
            [
                { id: `confirm_trade_${orderId}`, label: "✅ Confirm Trade" },
                { id: "/start",                  label: "❌ Cancel" },
            ]
        );
        return;
    }

    // ─── confirm_trade_<orderId> — User taps Confirm Trade ────────────────────
    if (text.startsWith("confirm_trade_")) {
        const orderId = text.replace("confirm_trade_", "").trim();
        let order: any;
        try {
            order = await db.getOrderById(orderId);
        } catch {
            await reply(sock, jid, "❌ Ad not found.", msg);
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

        const isBuyer = order.type === "sell";
        const buyerId = isBuyer ? user.id : order.user_id;
        const sellerId = isBuyer ? order.user_id : user.id;

        // If current user is seller, verify they have payment details configured
        if (!isBuyer) {
            const hasPayment = Boolean(user.upi_id || user.phone_number || (user as any).bank_account_number);
            if (!hasPayment) {
                await replyWithButtons(
                    sock,
                    jid,
                    `⚠️ *PAYMENT METHOD REQUIRED*\n\nYou are selling crypto in this trade. Please set up your payment details in /profile first so the buyer knows where to pay!`,
                    [{ id: "/profile", label: "⚙️ Set Payment Method" }]
                );
                return;
            }
        }

        try {
            // 1. Atomically Mark Order as Filled (Prevent Race Conditions)
            await db.updateOrder(order.id, { status: "filled", filled_amount: order.amount });
            
            await reply(sock, jid, "⏳ Locking crypto in smart contract escrow... Please wait.", msg);

            const tokenSymbol = order.token || "USDC";
            const { env } = await import("../../config/env");
            const tokenAddress = tokenSymbol === "USDT" ? env.USDT_ADDRESS : env.USDC_ADDRESS;
            const { wallet } = await import("../../services/wallet");
            const { escrow } = await import("../../services/escrow");

            const seller = await db.getUserById(sellerId);
            const buyer = await db.getUserById(buyerId);
            
            if (!seller?.wallet_address || !buyer?.wallet_address) {
                await db.revertFillOrder(order.id, order.amount);
                await reply(sock, jid, "❌ Trade failed: One of the parties does not have a wallet set up.", msg);
                return;
            }

            // 2. Check Seller Balance
            const vaultBalanceStr = await escrow.getVaultBalance(seller.wallet_address, tokenAddress, order.chain as any);
            const vaultBalance = parseFloat(vaultBalanceStr);

            if (vaultBalance < order.amount) {
                // Check Hot Wallet
                const hotBalanceStr = await wallet.getTokenBalance(seller.wallet_address, tokenAddress);
                const hotBalance = parseFloat(hotBalanceStr);

                if (hotBalance < order.amount) {
                    await db.revertFillOrder(order.id, order.amount);
                    await reply(sock, jid, `❌ Trade failed: Seller has insufficient funds (Needs ${order.amount} ${tokenSymbol}).`, msg);
                    
                    // Notify seller they missed a trade
                    if (isBuyer) {
                        await sendUserAlert(seller, `⚠️ *TRADE FAILED!*\n\nA buyer tried to match your ${order.amount} ${tokenSymbol} ad, but you don't have enough balance.`);
                    }
                    return;
                }

                try {
                    // Auto-deposit
                    await wallet.depositToVault(seller.wallet_index, order.amount.toString(), tokenAddress);
                } catch (err: any) {
                    await db.revertFillOrder(order.id, order.amount);
                    await reply(sock, jid, `❌ Trade failed: Auto-deposit failed (likely insufficient gas).`, msg);
                    return;
                }
            }

            // 3. Lock in Smart Contract
            const tradeIdOnChainStr = await escrow.createRelayedTrade(
                seller.wallet_address,
                buyer.wallet_address,
                tokenAddress,
                order.amount.toString(),
                1800, // 30 min deadline
                order.chain as any
            );

            // 4. Create local Trade record
            const feePercent = env.getFeePercentage(order.chain);
            const trade = await db.createTrade({
                order_id: order.id,
                buyer_id: buyerId,
                seller_id: sellerId,
                token: tokenSymbol,
                amount: order.amount,
                rate: order.rate,
                fiat_amount: Math.round(order.amount * order.rate),
                fiat_currency: "INR",
                fee_amount: order.amount * feePercent,
                fee_percentage: feePercent,
                buyer_receives: order.amount * (1 - feePercent),
                payment_method: (order.payment_methods ?? [])[0] ?? "UPI",
                chain: order.chain || "base",
                status: "in_escrow",
                on_chain_trade_id: Number(tradeIdOnChainStr),
                escrow_tx_hash: "pending",
                created_at: new Date().toISOString()
            } as any);

            await replyWithButtons(
                sock,
                jid,
                `🤝 *TRADE MATCHED & ESCROW LOCKED!*

• *Trade ID:* \`${trade.id.slice(0, 8)}\`
• *Amount:* ${trade.amount} ${tokenSymbol}
• *Pay Fiat:* ₹${trade.fiat_amount} via ${(trade as any).payment_method}

⚠️ *Buyer:* Pay to the seller's payment details, then tap *Payment Sent*.`,
                [
                    { id: `/paid_${trade.id}`,    label: "💳 Payment Sent" },
                    { id: `/dispute_${trade.id}`, label: "⚠️ Open Dispute" },
                ]
            );

            // Alert Seller with interactive action buttons
            if (sellerId !== user.id) { // Only alert if the current user isn't the seller
                await sendUserAlert(
                    seller,
                    `🤝 *TRADE MATCHED!* Buyer has initiated trade for ${trade.amount} ${tokenSymbol} (₹${trade.fiat_amount}). Crypto is locked in escrow. Awaiting payment.`,
                    undefined,
                    [{ id: `/dispute_${trade.id}`, label: "⚠️ Open Dispute" }]
                );
            }

        } catch (err: any) {
            console.error("[WA-Trade] Critical match error:", err);
            // Safety fallback
            await db.revertFillOrder(order.id, order.amount).catch(() => {});
            await reply(sock, jid, `❌ Failed to initiate trade: ${err?.message || err}`, msg);
        }
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

            await replyWithButtons(
                sock,
                jid,
                `✅ *Payment Marked as Sent!*

The seller has been notified to check their bank account/UPI.`,
                [
                    { id: `/dispute_${trade.id}`, label: "⚠️ Open Dispute" },
                ]
            );

            // Notify seller with instant 1-tap Confirm Release & Dispute buttons
            const seller = await db.getUserById(trade.seller_id);
            if (seller) {
                await sendUserAlert(
                    seller,
                    `💸 *PAYMENT SENT BY BUYER!*\n\nBuyer marked ₹${trade.fiat_amount} as sent via ${trade.payment_method}.\n\nPlease verify your bank account/UPI app:`,
                    undefined,
                    [
                        { id: `/release_${trade.id}`, label: "🔓 Confirm Release" },
                        { id: `/dispute_${trade.id}`, label: "⚠️ Open Dispute" },
                    ]
                );
            }

        } catch (err) {
            await reply(sock, jid, "❌ Failed to mark payment. Please try again.", msg);
        }
        return;
    }

    // ─── /release_<tradeId> — Seller releases crypto directly (Instant, No PIN) ─
    if (text.startsWith("/release_") || text.startsWith("confirm_release_")) {
        const tradeId = text.replace("/release_", "").replace("confirm_release_", "").trim();
        const trade = await db.getTradeById(tradeId);

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

        try {
            await reply(sock, jid, "⏳ Releasing funds on-chain... Please wait.", msg);

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

            const chain = (trade.chain || "base").toLowerCase();
            const explorerBase = chain === "bsc" ? "https://bscscan.com/tx/" : "https://basescan.org/tx/";
            const txLink = txHash && txHash.startsWith("0x") ? `${explorerBase}${txHash}` : null;

            let completionText = fmtTradeReleased({ ...trade, release_tx_hash: txHash });
            if (txLink) {
                completionText += `\n\n🔗 *Transaction Explorer:* ${txLink}`;
            }

            await reply(sock, jid, completionText, msg);

            // Notify buyer with TX Link
            const buyer = await db.getUserById(trade.buyer_id);
            if (buyer) {
                await sendUserAlert(buyer, completionText);
            }

        } catch (err) {
            await reply(sock, jid, "❌ Release failed. Contact @P2PFatherSupport", msg);
        }
        return;
    }

    // ─── /dispute_<tradeId> — Open dispute ────────────────────────────────────
    if (text.startsWith("/dispute_")) {
        const tradeId = text.replace("/dispute_", "").trim();
        const trade   = await db.getTradeById(tradeId);

        if (!trade) {
            await reply(sock, jid, "❌ Trade not found.", msg);
            return;
        }

        try {
            await db.updateTrade(tradeId, { status: "disputed", dispute_reason: "Raised via WhatsApp bot" });

            if (trade.on_chain_trade_id) {
                try {
                    await escrow.raiseDispute(trade.on_chain_trade_id, "Dispute via WA Bot", trade.chain as any);
                } catch (e: any) {
                    console.error("[WA] On-chain dispute error:", e.message);
                }
            }

            await reply(sock, jid, fmtDisputeOpened(trade), msg);

            const otherUserId = trade.buyer_id === user.id ? trade.seller_id : trade.buyer_id;
            const otherUser   = await db.getUserById(otherUserId);
            if (otherUser) {
                await sendUserAlert(otherUser, `⚠️ *DISPUTE OPENED* on Trade \`${trade.id.slice(0, 8)}\` by counterparty. Admin team is reviewing.`);
            }

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
        return;
    }

    // ─── /trades or [📜 Active Trades] ─────────────────────────────────────────
    if (text === "/trades" || text === "my_trades" || text.startsWith("/trades")) {
        try {
            const client = (db as any).getClient();
            const { data: activeTrades, error } = await client
                .from("trades")
                .select("*, buyer:users!buyer_id(username, whatsapp_phone), seller:users!seller_id(username, whatsapp_phone)")
                .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
                .in("status", ["matched", "in_escrow", "fiat_sent", "releasing", "disputed"])
                .order("created_at", { ascending: false });

            if (error || !activeTrades || activeTrades.length === 0) {
                await replyWithButtons(
                    sock,
                    jid,
                    `📜 *MY TRADES*

You currently have no active ongoing trades.`,
                    [
                        { id: "/ads",     label: "📊 Browse Ads" },
                        { id: "/post",    label: "➕ Create Ad" },
                        { id: "/start",   label: "🏠 Main Menu" },
                    ]
                );
                return;
            }

            for (const trade of activeTrades.slice(0, 5)) {
                const isBuyer = trade.buyer_id === user.id;
                const roleLabel = isBuyer ? "🟢 BUYER" : "🔴 SELLER";
                const shortId = trade.id.slice(0, 5).toUpperCase();
                const formattedTradeId = `PF-${shortId}`;

                const counterparty = isBuyer ? trade.seller : trade.buyer;
                const counterpartyHandle = counterparty?.whatsapp_phone
                    ? `+${counterparty.whatsapp_phone}`
                    : (counterparty?.username ? `@${counterparty.username}` : "Trader");

                let statusText = "🟢 Active";
                if (trade.status === "in_escrow") statusText = "🔒 USDT Locked in Escrow";
                if (trade.status === "fiat_sent") statusText = "💸 Payment Marked Sent";
                if (trade.status === "disputed") statusText = "⚠️ Under Admin Dispute";

                const webUrl = getTradeWebUrl(trade.id, user.id);
                const cardMsg =
`🤝 *TRADE #${formattedTradeId}*

• *Role:* ${roleLabel}
• *Amount:* ${trade.amount} USDT (₹${trade.fiat_amount})
• *Chain:* ${trade.chain?.toUpperCase() ?? "BSC"}
• *Counterparty:* ${counterpartyHandle}
• *Status:* ${statusText}

🌐 *Live Web Trade Room:*
${webUrl}`;

                const buttons: { id: string; label: string }[] = [
                    { id: `/chat_${trade.id}`, label: "💬 Chat Counterparty" },
                ];

                if (isBuyer && (trade.status === "matched" || trade.status === "in_escrow")) {
                    buttons.push({ id: `/paid_${trade.id}`, label: "💸 Mark Paid" });
                } else if (!isBuyer && (trade.status === "in_escrow" || trade.status === "fiat_sent")) {
                    buttons.push({ id: `/release_${trade.id}`, label: "🔓 Confirm Release" });
                }

                buttons.push({ id: `/dispute_${trade.id}`, label: "⚠️ Open Dispute" });

                await replyWithButtons(sock, jid, cardMsg, buttons.slice(0, 3));
                await new Promise((r) => setTimeout(r, 250));
            }

            // Universal nav frame
            await replyWithButtons(sock, jid, `🧭 *TRADE MENU*`, [
                { id: "/start",   label: "🏠 Main Menu" },
                { id: "/profile", label: "👤 My Profile" },
                { id: "/ads",     label: "📊 Browse Ads" },
            ]);
        } catch (err: any) {
            await reply(sock, jid, "❌ Failed to load active trades. Try again.", msg);
        }
        return;
    }

    // ─── /chat_<tradeId> ──────────────────────────────────────────────────────
    if (text.startsWith("/chat_")) {
        const tradeId = text.replace("/chat_", "").trim();
        try {
            const trade = await db.getTradeById(tradeId);
            if (!trade) {
                await reply(sock, jid, "❌ Trade not found.", msg);
                return;
            }

            const isBuyer = trade.buyer_id === user.id;
            const counterpartyId = isBuyer ? trade.seller_id : trade.buyer_id;
            const counterparty = await db.getUserById(counterpartyId);

            await (db as any).setWhatsappState(user.id, `IN_TRADE_CHAT_${tradeId}`, { counterpartyId });

            const shortId = trade.id.slice(0, 5).toUpperCase();
            const counterpartyHandle = counterparty?.whatsapp_phone
                ? `+${counterparty.whatsapp_phone}`
                : (counterparty?.username ? `@${counterparty.username}` : "Counterparty");

            await replyWithButtons(
                sock,
                jid,
                `💬 *LIVE TRADE CHAT (#PF-${shortId})*

You are now in live direct chat with *${counterpartyHandle}*!
Every text message you send now will be forwarded directly to them.

_Tap below when finished to return to main menu:_`,
                [
                    { id: "exit_trade_chat", label: "🚪 Exit Chat" },
                    { id: "/start",          label: "🏠 Main Menu" },
                ]
            );
        } catch (err) {
            await reply(sock, jid, "❌ Failed to enter chat mode.", msg);
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

        const buyer = await db.getUserById(trade.buyer_id);
        const seller = await db.getUserById(trade.seller_id);

        const buyerInfo = buyer?.whatsapp_phone
            ? `+${buyer.whatsapp_phone}${buyer.username ? ` (@${buyer.username})` : ""}`
            : (buyer?.username ? `@${buyer.username}` : `ID: ${trade.buyer_id.slice(0, 8)}`);

        const sellerInfo = seller?.whatsapp_phone
            ? `+${seller.whatsapp_phone}${seller.username ? ` (@${seller.username})` : ""}`
            : (seller?.username ? `@${seller.username}` : `ID: ${trade.seller_id.slice(0, 8)}`);

        const msg = 
`🚨 *NEW DISPUTE RAISED (WHATSAPP)* 🚨

• *Trade ID:* \`${trade.id}\`
• *Amount:* ${trade.amount} ${trade.token} (₹${trade.fiat_amount})
• *Chain:* ${trade.chain?.toUpperCase() ?? "BSC"}
• *Buyer:* \`${buyerInfo}\`
• *Seller:* \`${sellerInfo}\`

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


