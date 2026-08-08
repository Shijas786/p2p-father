/**
 * WhatsApp Ads Handler
 * Handles: /ads, /post, /my_ads, /delete_ad_<id>, /pause_ad_<id>
 */

import type { WASocket, IWebMessageInfo } from "../types";
import type { User } from "../../types";
import { db } from "../../db/client";
import { escrow } from "../../services/escrow";
import { env } from "../../config/env";
import { reply, replyWithButtons, replyWithList } from "../router";
import { fmtOrderList, fmtMyAds } from "../formatters";
import { broadcastNewAdToGroups } from "./group";
import { hasPaymentMethods } from "./profile";

/** Multi-step Post Ad flow state machine */
type AdStep = "TYPE" | "TOKEN" | "RATE" | "AMOUNT" | "LIMITS" | "PAYMENT" | "CONFIRM";

interface AdDraft {
    step: AdStep;
    type?: "buy" | "sell";
    token?: string;
    chain?: string;
    rate?: number;
    amount?: number;
    min_amount?: number;
    max_amount?: number;
    payment_methods?: string[];
}

export async function handleAdCommand(
    sock: WASocket,
    msg: IWebMessageInfo,
    jid: string,
    user: User,
    text: string
): Promise<void> {
    // ─── /ads — Browse live ads ─────────────────────────────────────────────────
    if (text === "/ads" || text.startsWith("/ads ")) {
        const typeFilter = text.includes("buy") ? "buy" : text.includes("sell") ? "sell" : undefined;
        const orders = await db.getActiveOrders(typeFilter, "USDT", 8);
        const label = typeFilter ?? "all";

        if (orders.length === 0) {
            await replyWithButtons(
                sock,
                jid,
                `📊 *No active ${typeFilter?.toUpperCase() ?? ""} ads right now.*\n\nBe the first to post an ad!`,
                [
                    { id: "/ads sell", label: "🟢 SELL Ads" },
                    { id: "/ads buy",  label: "🔴 BUY Ads"  },
                    { id: "/post",     label: "➕ Post My Ad" },
                ]
            );
            return;
        }

        // Group ads into sections by type for single_select list
        const sellAds = (orders as any[]).filter((o) => o.type === "sell");
        const buyAds  = (orders as any[]).filter((o) => o.type === "buy");

        const sections: { title: string; rows: { id: string; title: string; description: string }[] }[] = [];

        if (sellAds.length > 0) {
            sections.push({
                title: "🟢 SELL USDT — Buy from these traders",
                rows: sellAds.map((o) => {
                    const trader = o.users?.username ? `@${o.users.username}` : (o.users?.first_name ?? "Trader");
                    const trust  = o.users?.trust_score ?? 0;
                    const pay    = (o.payment_methods ?? []).join("/");
                    return {
                        id:          `trade_ad_${o.id}`,
                        title:       `₹${o.rate} / USDT — ${trader} (⭐${trust}%)`,
                        description: `Limits: ₹${o.min_amount}–${o.max_amount} • ${pay}`,
                    };
                }),
            });
        }

        if (buyAds.length > 0) {
            sections.push({
                title: "🔴 BUY USDT — Sell to these traders",
                rows: buyAds.map((o) => {
                    const trader = o.users?.username ? `@${o.users.username}` : (o.users?.first_name ?? "Trader");
                    const trust  = o.users?.trust_score ?? 0;
                    const pay    = (o.payment_methods ?? []).join("/");
                    return {
                        id:          `trade_ad_${o.id}`,
                        title:       `₹${o.rate} / USDT — ${trader} (⭐${trust}%)`,
                        description: `Limits: ₹${o.min_amount}–${o.max_amount} • ${pay}`,
                    };
                }),
            });
        }

        const headerText = label === "buy"
            ? "📊 *LIVE BUY ADS — Sell your USDT*"
            : label === "sell"
                ? "📊 *LIVE SELL ADS — Buy USDT*"
                : "📊 *P2PFATHER LIVE ORDERBOOK*";

        await replyWithList(
            sock,
            jid,
            headerText,
            "Choose a trader to trade instantly",
            sections
        );
        return;
    }

    // ─── /my_ads — View own ads ───────────────────────────────────────────────
    if (text === "/my_ads") {
        const myOrders = await db.getOrdersByUserId(user.id);
        await reply(sock, jid, fmtMyAds(myOrders as any), msg);
        return;
    }

    // ─── /delete_ad_<id> ─────────────────────────────────────────────────────
    if (text.startsWith("/delete_ad_")) {
        const orderId = text.replace("/delete_ad_", "").trim();
        try {
            await db.cancelOrder(orderId);
            await reply(sock, jid, `✅ Ad \`${orderId.slice(0, 8)}\` has been deleted.`, msg);
        } catch {
            await reply(sock, jid, "❌ Could not delete ad. Make sure you own it.", msg);
        }
        return;
    }

    // ─── /pause_ad_<id> ──────────────────────────────────────────────────────
    if (text.startsWith("/pause_ad_")) {
        const orderId = text.replace("/pause_ad_", "").trim();
        try {
            await db.pauseOrder(orderId, user.id);
            await reply(sock, jid, `⏸ Ad \`${orderId.slice(0, 8)}\` has been paused.`, msg);
        } catch {
            await reply(sock, jid, "❌ Could not pause ad.", msg);
        }
        return;
    }

    // ─── /post — Create a new ad ──────────────────────────────────────────────
    if (text === "/post") {
        // Initialize draft state
        await (db as any).setWhatsappState(user.id, "POST_AD", { step: "TYPE" } as AdDraft);

        await replyWithButtons(
            sock,
            jid,
            `➕ *POST A P2P AD*\n\nStep 1 of 5: What type of ad do you want to post?`,
            [
                { id: "ad_type_sell", label: "🟢 SELL (I have USDT)" },
                { id: "ad_type_buy",  label: "🔴 BUY  (I want USDT)" },
            ]
        );
        return;
    }

    // ─── Handle button callbacks for multi-step ad creation ───────────────────
    const state = await (db as any).getWhatsappState(user.id);
    if (state?.key === "POST_AD") {
        await handleAdCreationFlow(sock, msg, jid, user, text, state.data as AdDraft);
    }
}

async function handleAdCreationFlow(
    sock: WASocket,
    msg: IWebMessageInfo,
    jid: string,
    user: User,
    text: string,
    draft: AdDraft
): Promise<void> {
    const lower = text.toLowerCase().trim();
    if (lower === "back" || lower === "cancel" || lower === "ad_cancel" || lower === "/cancel") {
        await (db as any).clearWhatsappState(user.id);
        await replyWithButtons(
            sock,
            jid,
            "❌ *Ad creation cancelled.*",
            [
                { id: "/ads",     label: "📊 Browse Ads" },
                { id: "/profile", label: "👤 View Profile" },
            ]
        );
        return;
    }

    switch (draft.step) {
        // ── Step 1: Ad type ───────────────────────────────────────────────────
        case "TYPE": {
            if (!text.includes("sell") && !text.includes("buy")) {
                await reply(sock, jid, "Please tap 🟢 SELL or 🔴 BUY", msg);
                return;
            }
            const type = text.includes("sell") ? "sell" : "buy";

            // If SELL ad, check Escrow Vault balance FIRST!
            if (type === "sell" && user.wallet_address) {
                try {
                    const bscUsdt = await escrow.getVaultBalance(user.wallet_address, "0x55d398326f99059fF775485246999027B3197955", "bsc").catch(() => "0");
                    const baseUsdt = await escrow.getVaultBalance(user.wallet_address, env.USDT_ADDRESS, "base").catch(() => "0");
                    const totalVault = parseFloat(bscUsdt) + parseFloat(baseUsdt);

                    if (totalVault <= 0) {
                        await (db as any).clearWhatsappState(user.id);
                        await replyWithButtons(
                            sock,
                            jid,
                            `❌ *INSUFFICIENT ESCROW VAULT BALANCE*

To post a *SELL Ad*, you must first deposit USDT into your P2PFather Smart Contract Vault.

💳 *Wallet:* \`${user.wallet_address}\`
🔒 *Vault Balance:* 0.00 USDT

_Please top up your vault by sending USDT to your deposit address before creating a SELL ad._`,
                            [
                                { id: "/deposit", label: "📥 Deposit USDT" },
                                { id: "/profile", label: "🔙 Back to Profile" },
                            ]
                        );
                        return;
                    }
                } catch (_) {
                    // Continue if RPC read fails temporarily
                }
            }

            draft.type = type;
            draft.step = "TOKEN";
            await (db as any).setWhatsappState(user.id, "POST_AD", draft);

            await replyWithButtons(
                sock,
                jid,
                `✅ *${type.toUpperCase()} Ad selected.*\n\nStep 2 of 5: Select token & chain:`,
                [
                    { id: "ad_token_usdt_bsc",     label: "USDT (BSC)" },
                    { id: "ad_token_usdt_base",     label: "USDT (Base)" },
                    { id: "ad_cancel",              label: "🔙 Cancel" },
                ]
            );
            return;
        }

        // ── Step 2: Token ─────────────────────────────────────────────────────
        case "TOKEN": {
            if (!text.includes("usdt")) {
                await reply(sock, jid, "Please select a token from the options.", msg);
                return;
            }
            draft.token = "USDT";
            draft.chain = text.includes("polygon") ? "polygon" : text.includes("base") ? "base" : "bsc";
            draft.step  = "RATE";
            await (db as any).setWhatsappState(user.id, "POST_AD", draft);

            await reply(
                sock,
                jid,
                `✅ *USDT (${draft.chain!.toUpperCase()}) selected.*\n\nStep 3 of 5: Enter your *exchange rate* (₹ per USDT)\n\n*Example:* \`89.50\``,
                msg
            );
            return;
        }

        // ── Step 3: Rate ──────────────────────────────────────────────────────
        case "RATE": {
            const rate = parseFloat(text);
            if (isNaN(rate) || rate < 1) {
                await reply(sock, jid, "❌ Invalid rate. Enter a valid ₹ rate, e.g. `89.50`", msg);
                return;
            }
            draft.rate = rate;
            draft.step = "AMOUNT";
            await (db as any).setWhatsappState(user.id, "POST_AD", draft);

            await reply(
                sock,
                jid,
                `✅ *Rate: ₹${rate} / USDT*\n\nStep 4 of 5: Enter the *total USDT amount* for this ad:\n\n*Example:* \`100\` (for 100 USDT → ₹${(100 * rate).toLocaleString("en-IN")})`,
                msg
            );
            return;
        }

        // ── Step 4: Amount ────────────────────────────────────────────────────
        case "AMOUNT": {
            const amount = parseFloat(text);
            if (isNaN(amount) || amount <= 0) {
                await reply(sock, jid, "❌ Enter a valid USDT amount.\n*Example:* `100`", msg);
                return;
            }
            const totalFiat = Math.round(amount * draft.rate!);
            draft.amount = amount;
            draft.min_amount = 100;
            draft.max_amount = totalFiat;
            draft.step = "PAYMENT";
            await (db as any).setWhatsappState(user.id, "POST_AD", draft);

            await replyWithButtons(
                sock,
                jid,
                `✅ *Amount: ${amount} USDT (Total: ₹${totalFiat.toLocaleString("en-IN")})*\n\nStep 5 of 5: Select *payment method*:`,
                [
                    { id: "ad_pay_upi",        label: "📱 UPI (GPay/PhonePe)" },
                    { id: "ad_pay_imps",       label: "🏦 Bank Transfer / IMPS" },
                    { id: "ad_pay_upi_imps",   label: "📱 UPI + Bank Transfer" },
                ]
            );
            return;
        }

        // ── Step 5: Payment → Confirm & Select Publish Target ───────────────
        case "PAYMENT": {
            let methods: string[] = [];
            if (text.includes("upi"))  methods.push("UPI");
            if (text.includes("imps")) methods.push("IMPS");
            if (text.includes("bank")) methods.push("BANK");
            if (methods.length === 0)  methods = ["UPI"];

            draft.payment_methods = methods;
            draft.step = "CONFIRM";
            await (db as any).setWhatsappState(user.id, "POST_AD", draft);

            const totalFiat = Math.round((draft.amount || 0) * (draft.rate || 0));

            await replyWithButtons(
                sock,
                jid,
                `📋 *CONFIRM & PUBLISH AD*

• *Type:* ${draft.type!.toUpperCase()} USDT
• *Token:* USDT (${draft.chain!.toUpperCase()})
• *Amount:* ${draft.amount} USDT
• *Rate:* ₹${draft.rate} / USDT
• *Total Fiat:* ₹${totalFiat.toLocaleString("en-IN")}
• *Payment:* ${methods.join(", ")}

Where do you want to publish this ad? 👇`,
                [
                    { id: "ad_pub_both", label: "🌐 Publish on Both (WA + TG)" },
                    { id: "ad_pub_wa",   label: "📲 WhatsApp Groups Only" },
                    { id: "ad_pub_tg",   label: "✈️ Telegram Groups Only" },
                ]
            );
            return;
        }

        // ── Final: Publish to Selected Channel(s) ──────────────────────────────
        case "CONFIRM": {
            if (text.includes("no") || text.includes("cancel")) {
                await (db as any).clearWhatsappState(user.id);
                await reply(sock, jid, "❌ Ad creation cancelled.", msg);
                return;
            }

            try {
                const orderAmount = draft.amount || draft.max_amount || 100;
                const totalFiat = Math.round(orderAmount * (draft.rate || 0));

                const order = await db.createOrder({
                    user_id:         user.id,
                    type:            draft.type as any,
                    token:           draft.token!,
                    chain:           draft.chain!,
                    amount:          orderAmount,
                    min_amount:      100,
                    max_amount:      totalFiat,
                    rate:            draft.rate!,
                    fiat_currency:   "INR",
                    payment_methods: draft.payment_methods as any[],
                    status:          "active",
                    filled_amount:   0,
                    payment_details: {},
                });

                await (db as any).clearWhatsappState(user.id);

                const pubWa = lower.includes("wa") || lower.includes("both") || lower.includes("publish");
                const pubTg = lower.includes("tg") || lower.includes("both");

                let channelText = "🌐 Both WhatsApp & Telegram";
                if (pubWa && !pubTg) channelText = "📲 WhatsApp Groups";
                if (pubTg && !pubWa) channelText = "✈️ Telegram Groups";

                await replyWithButtons(
                    sock,
                    jid,
                    `🎉 *AD PUBLISHED SUCCESSFULLY!*

Your ${draft.type!.toUpperCase()} ad is now LIVE!
• *Amount:* ${orderAmount} USDT (Total: ₹${totalFiat.toLocaleString("en-IN")})
• *Rate:* ₹${draft.rate} / USDT
• *Published To:* ${channelText}

Traders can now find and trade with you! 🚀`,
                    [
                        { id: "/my_ads",  label: "📋 My Ads" },
                        { id: "/ads",     label: "📊 Browse Ads" },
                    ]
                );

                // Broadcast to selected channels
                const fullOrder = { ...order, users: user };

                if (pubWa) {
                    await broadcastNewAdToGroups(fullOrder);
                }
                if (pubTg) {
                    try {
                        const { broadcastAd } = await import("../../bot");
                        await broadcastAd(fullOrder, user);
                    } catch (e: any) {
                        console.error("[WA-AdPost] Telegram broadcast error:", e.message);
                    }
                }

            } catch (err: any) {
                await reply(sock, jid, `❌ Failed to create ad: ${err?.message || err}`, msg);
            }
            return;
        }
    }
}
