/**
 * WhatsApp Ads Handler
 * Handles: /ads, /post, /my_ads, /delete_ad_<id>, /pause_ad_<id>
 */

import type { WASocket, IWebMessageInfo } from "../types";
import type { User } from "../../types";
import { db } from "../../db/client";
import { reply, replyWithButtons, replyWithList } from "../router";
import { fmtOrderList, fmtMyAds } from "../formatters";
import { broadcastNewAdToGroups } from "./group";

/** Multi-step Post Ad flow state machine */
type AdStep = "TYPE" | "TOKEN" | "RATE" | "LIMITS" | "PAYMENT" | "CONFIRM";

interface AdDraft {
    step: AdStep;
    type?: "buy" | "sell";
    token?: string;
    rate?: number;
    min_amount?: number;
    max_amount?: number;
    payment_methods?: string[];
    chain?: string;
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
            `${headerText}\n\nTap an ad to start an escrow-protected trade 🔒`,
            "💼 Select an Ad to Trade",
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

    // ─── /post — Start multi-step ad creation flow ────────────────────────────
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
    switch (draft.step) {
        // ── Step 1: Ad type ───────────────────────────────────────────────────
        case "TYPE": {
            if (!text.includes("sell") && !text.includes("buy")) {
                await reply(sock, jid, "Please tap 🟢 SELL or 🔴 BUY", msg);
                return;
            }
            const type = text.includes("sell") ? "sell" : "buy";
            draft.type = type;
            draft.step = "TOKEN";
            await (db as any).setWhatsappState(user.id, "POST_AD", draft);

            await replyWithButtons(
                sock,
                jid,
                `✅ *${type.toUpperCase()} Ad selected.*\n\nStep 2 of 5: Select token & chain:`,
                [
                    { id: "ad_token_usdt_bsc",     label: "USDT (BSC)" },
                    { id: "ad_token_usdt_polygon",  label: "USDT (Polygon)" },
                    { id: "ad_token_usdt_base",     label: "USDT (Base)" },
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
            draft.step = "LIMITS";
            await (db as any).setWhatsappState(user.id, "POST_AD", draft);

            await reply(
                sock,
                jid,
                `✅ *Rate: ₹${rate} / USDT*\n\nStep 4 of 5: Enter your *min and max trade limits* (₹)\n\n*Example:* \`1000 50000\``,
                msg
            );
            return;
        }

        // ── Step 4: Limits ────────────────────────────────────────────────────
        case "LIMITS": {
            const nums = text.match(/(\d+)/g);
            if (!nums || nums.length < 2) {
                await reply(sock, jid, "❌ Enter min and max limits separated by space.\n*Example:* `1000 50000`", msg);
                return;
            }
            draft.min_amount = parseInt(nums[0]);
            draft.max_amount = parseInt(nums[1]);
            draft.step       = "PAYMENT";
            await (db as any).setWhatsappState(user.id, "POST_AD", draft);

            await replyWithButtons(
                sock,
                jid,
                `✅ *Limits: ₹${draft.min_amount} – ₹${draft.max_amount}*\n\nStep 5 of 5: Select *payment methods* (you can pick multiple):\nReply with: \`UPI IMPS BANK\` (space-separated)`,
                [
                    { id: "ad_pay_upi",        label: "UPI (GPay/PhonePe)" },
                    { id: "ad_pay_imps",       label: "IMPS Bank Transfer" },
                    { id: "ad_pay_upi_imps",   label: "UPI + IMPS" },
                ]
            );
            return;
        }

        // ── Step 5: Payment → Confirm & Create ───────────────────────────────
        case "PAYMENT": {
            let methods: string[] = [];
            if (text.includes("upi"))  methods.push("UPI");
            if (text.includes("imps")) methods.push("IMPS");
            if (text.includes("bank")) methods.push("BANK");
            if (methods.length === 0)  methods = ["UPI"];

            draft.payment_methods = methods;
            draft.step = "CONFIRM";
            await (db as any).setWhatsappState(user.id, "POST_AD", draft);

            await replyWithButtons(
                sock,
                jid,
                `📋 *CONFIRM YOUR AD*

• *Type:* ${draft.type!.toUpperCase()} USDT
• *Token:* USDT (${draft.chain!.toUpperCase()})
• *Rate:* ₹${draft.rate}
• *Limits:* ₹${draft.min_amount} – ₹${draft.max_amount}
• *Payment:* ${methods.join(", ")}

Tap ✅ Publish to go live!`,
                [
                    { id: "ad_confirm_yes", label: "✅ Publish Ad" },
                    { id: "ad_confirm_no",  label: "❌ Cancel" },
                ]
            );
            return;
        }

        // ── Final: Publish ────────────────────────────────────────────────────
        case "CONFIRM": {
            if (text.includes("no") || text.includes("cancel")) {
                await (db as any).clearWhatsappState(user.id);
                await reply(sock, jid, "❌ Ad creation cancelled.", msg);
                return;
            }

            if (text.includes("yes") || text.includes("confirm") || text.includes("publish")) {
                try {
                    const order = await db.createOrder({
                        user_id:         user.id,
                        type:            draft.type as any,
                        token:           draft.token!,
                        chain:           draft.chain!,
                        amount:          draft.max_amount!,
                        min_amount:      draft.min_amount!,
                        max_amount:      draft.max_amount!,
                        rate:            draft.rate!,
                        fiat_currency:   "INR",
                        payment_methods: draft.payment_methods as any[],
                        status:          "active",
                        filled_amount:   0,
                        payment_details: {},
                    });

                    await (db as any).clearWhatsappState(user.id);

                    await replyWithButtons(
                        sock,
                        jid,
                        `🎉 *AD PUBLISHED!*

Your ${draft.type!.toUpperCase()} ad is now LIVE!
• *Rate:* ₹${draft.rate} / USDT
• *Limits:* ₹${draft.min_amount} – ₹${draft.max_amount}
• *Payment:* ${draft.payment_methods!.join(", ")}

Traders can now find and trade with you! 🚀`,
                        [
                            { id: "/my_ads",  label: "📋 My Ads" },
                            { id: "/ads",     label: "📊 Browse Ads" },
                        ]
                    );

                    // Broadcast to WhatsApp groups
                    await broadcastNewAdToGroups({ ...order, users: { username: user.username } });

                } catch (err) {
                    await reply(sock, jid, "❌ Failed to create ad. Please try again.", msg);
                }
            }
            return;
        }
    }
}
