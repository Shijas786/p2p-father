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
type AdStep = "TYPE" | "TOKEN" | "RATE" | "AMOUNT" | "PAYMENT" | "EXPIRY" | "KYC_REQ" | "NOTE" | "CONFIRM";

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
    expiry_minutes?: number;
    require_kyc?: boolean;
    note?: string;
}

export async function handleAdCommand(
    sock: WASocket,
    msg: IWebMessageInfo,
    jid: string,
    user: User,
    text: string
): Promise<void> {
    // ─── /ads — Browse live ads ─────────────────────────────────────────────────
    if (text === "/ads" || text === "ads" || text.includes("browse ads") || text.startsWith("/ads")) {
        const isSpecificBuy = text.includes("buy");
        const isSpecificSell = text.includes("sell");

        // If user tapped general "Browse Ads" without selecting buy/sell yet:
        if (!isSpecificBuy && !isSpecificSell) {
            await replyWithButtons(
                sock,
                jid,
                `📊 *P2PFATHER LIVE P2P MARKETPLACE*

Choose your trade direction below to view verified rates:

🟢 *BUY USDT* — Pay INR via UPI/IMPS to receive USDT
🔴 *SELL USDT* — Sell your USDT for instant INR in your bank

🔒 *100% Escrow Protection* — 0% fee on P2PFather.`,
                [
                    { id: "/ads buy",  label: "🟢 BUY USDT Ads" },
                    { id: "/ads sell", label: "🔴 SELL USDT Ads" },
                    { id: "https://p2pfather.com/webapp", url: "https://p2pfather.com/webapp", label: "🌐 Web Dashboard" },
                ]
            );
            return;
        }

        // Target active orders:
        // When user wants to "BUY USDT", they look for sellers (order.type === 'sell' or all active ads)
        // When user wants to "SELL USDT", they look for buyers (order.type === 'buy' or all active ads)
        const orderType = isSpecificBuy ? "sell" : "buy";
        let orders = await db.getActiveOrders(orderType, "USDT", 4);

        // Fallback: if no ads for that specific direction, show any active ads
        if (orders.length === 0) {
            orders = await db.getActiveOrders(undefined, "USDT", 4);
        }

        if (orders.length === 0) {
            await replyWithButtons(
                sock,
                jid,
                `📊 *No active ${isSpecificBuy ? "BUY" : "SELL"} ads right now.*\n\nBe the first to create an ad and start trading!`,
                [
                    { id: "/post", label: "➕ Post New Ad" },
                    { id: "/ads",  label: "📊 Other Ads" },
                    { id: "https://p2pfather.com/webapp", url: "https://p2pfather.com/webapp", label: "🌐 Web Dashboard" },
                ]
            );
            return;
        }

        const modeLabel = isSpecificBuy ? "BUY USDT (Get Crypto)" : "SELL USDT (Get INR)";
        let adCardText = `📊 *LIVE ${modeLabel}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        const buttons: { id: string; label: string; url?: string }[] = [];

        orders.slice(0, 2).forEach((o: any, idx: number) => {
            const fname = o.users?.first_name && !/^WA_\d+$/.test(o.users.first_name) ? o.users.first_name : null;
            const trader = o.users?.username ? `@${o.users.username}` : (fname ?? "Verified Trader");
            const trust  = o.users?.trust_score ?? 100;
            const pay    = (o.payment_methods ?? []).filter(Boolean).join("/") || "UPI/IMPS";
            const minL   = o.min_amount ? `₹${o.min_amount}` : "₹500";
            const maxL   = o.max_amount ? `₹${o.max_amount}` : `₹${Math.round((o.amount || 100) * (o.rate || 90))}`;

            const numEmoji = idx === 0 ? "1️⃣" : "2️⃣";
            adCardText += `${numEmoji} *₹${o.rate} / USDT* — ${trader}\n`;
            adCardText += `   ⭐ Trust: *${trust}%* | Stock: *${o.amount} USDT*\n`;
            adCardText += `   💳 Limits: *${minL} – ${maxL}*\n`;
            adCardText += `   ⚡ Methods: *${pay}*\n\n`;

            buttons.push({
                id: `trade_ad_${o.id}`,
                label: `⚡ Trade with #${idx + 1} (₹${o.rate})`,
            });
        });

        adCardText += `━━━━━━━━━━━━━━━━━━━━\n_Tap a button below to start trading instantly with escrow:_`;

        buttons.push({
            id: "https://p2pfather.com/webapp",
            url: "https://p2pfather.com/webapp",
            label: "🌐 Full Web Orderbook",
        });

        await replyWithButtons(sock, jid, adCardText.trim(), buttons);
        return;
    }

    // ─── /my_ads — View own ads with 1-card-per-ad paginated navigation ──────
    if (text === "/my_ads" || text.startsWith("my_ads_page_")) {
        let pageIndex = 0;
        if (text.startsWith("my_ads_page_")) {
            pageIndex = parseInt(text.replace("my_ads_page_", ""), 10) || 0;
        }
        await showMyAdCard(sock, jid, msg, user, pageIndex);
        return;
    }

    // ─── /delete_<id> ────────────────────────────────────────────────────────
    if (text.startsWith("/delete") || text.startsWith("/del_")) {
        const inputId = text.replace("/delete_ad_", "").replace("/delete_", "").replace("/del_", "").trim();
        const myOrders = await db.getOrdersByUserId(user.id);
        const target = myOrders.find((o: any) => o.id === inputId || o.id.startsWith(inputId));

        if (!target) {
            await reply(sock, jid, "❌ Ad not found or already deleted.", msg);
            return;
        }

        try {
            await db.cancelOrder(target.id);
            await replyWithButtons(
                sock,
                jid,
                `✅ *Ad \`${target.id.slice(0, 8)}\` Deleted Successfully!*`,
                [
                    { id: "/my_ads", label: "📋 My Ads" },
                    { id: "/post",   label: "➕ Post New Ad" },
                ]
            );
        } catch {
            await reply(sock, jid, "❌ Could not delete ad. Make sure you own it.", msg);
        }
        return;
    }

    // ─── /pause_<id> ─────────────────────────────────────────────────────────
    if (text.startsWith("/pause")) {
        const inputId = text.replace("/pause_ad_", "").replace("/pause_", "").trim();
        const myOrders = await db.getOrdersByUserId(user.id);
        const target = myOrders.find((o: any) => o.id === inputId || o.id.startsWith(inputId));

        if (!target) {
            await reply(sock, jid, "❌ Ad not found.", msg);
            return;
        }

        try {
            await db.pauseOrder(target.id, user.id);
            await replyWithButtons(
                sock,
                jid,
                `⏸ *Ad \`${target.id.slice(0, 8)}\` Paused!*`,
                [
                    { id: "/my_ads", label: "📋 My Ads" },
                ]
            );
        } catch {
            await reply(sock, jid, "❌ Could not pause ad.", msg);
        }
        return;
    }

    // ─── Legacy AI Ad Confirmation (Redirect to safe /post flow) ────────────────
    if (text.startsWith("ad_confirm_")) {
        await (db as any).clearWhatsappState(user.id);
        await handleAdCommand(sock, msg, jid, user, "/post");
        return;
    }

    // ─── /post — Create a new ad ──────────────────────────────────────────────
    if (text === "/post") {
        if (!hasPaymentMethods(user)) {
            await replyWithButtons(
                sock,
                jid,
                `💳 *PAYMENT METHOD REQUIRED*

To post a BUY or SELL ad, you must first set at least one payment method (UPI ID or Bank Account) on your profile.

This ensures counterparties can send or receive fiat payments.`,
                [
                    { id: "set_upi",  label: "📱 Set UPI ID" },
                    { id: "/profile", label: "👤 View Profile" },
                ]
            );
            return;
        }

        // Initialize draft state
        await (db as any).setWhatsappState(user.id, "POST_AD", { step: "TYPE" } as AdDraft);

        await replyWithButtons(
            sock,
            jid,
            `➕ *POST A P2P AD*\n\nStep 1 of 4: What type of ad do you want to post?`,
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

    // ── Mandatory Payment Method Gate ──
    if (!hasPaymentMethods(user)) {
        await (db as any).clearWhatsappState(user.id);
        await replyWithButtons(
            sock,
            jid,
            `💳 *PAYMENT METHOD REQUIRED*

To post a BUY or SELL ad, you must first set at least one payment method (UPI ID or Bank Account) on your profile.

This ensures counterparties can send or receive fiat payments.`,
            [
                { id: "set_upi",  label: "📱 Set UPI ID" },
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

            // For SELL ads: show user their available vault balance on BSC Testnet as a heads-up.
            if (type === "sell" && user.wallet_address) {
                try {
                    const testnetUsdt = await escrow.getVaultBalance(user.wallet_address, "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd", "bsc_testnet").catch(() => "0");
                    const vaultBal = parseFloat(testnetUsdt);

                    if (vaultBal <= 0) {
                        await (db as any).clearWhatsappState(user.id);
                        await replyWithButtons(
                            sock,
                            jid,
                            `🔒 *SELL AD — VAULT BALANCE REQUIRED*

To post a SELL ad, you must have USDT locked in your P2PFather Escrow Vault (BSC Testnet).

💰 *Your Vault Balance:* 0.00 USDT (BSC Testnet)

Please deposit testnet USDT to your wallet and lock it to the Vault first.`,
                            [
                                { id: "/deposit",      label: "📥 Deposit USDT" },
                                { id: "vault_deposit", label: "🔒 Lock to Vault" },
                            ]
                        );
                        return;
                    }

                    await reply(
                        sock,
                        jid,
                        `💰 *Your Vault Balance:* ${vaultBal.toFixed(2)} USDT (BSC Testnet)\n\n✅ *SELL Ad selected (🧪 BSC Testnet).*`,
                        msg
                    );
                } catch (_) {
                    // RPC unavailable — let them proceed, hard check at AMOUNT step
                }
            }

            draft.type  = type;
            draft.token = "USDT";
            draft.chain = "bsc_testnet";
            draft.step  = "RATE";
            await (db as any).setWhatsappState(user.id, "POST_AD", draft);

            await reply(
                sock,
                jid,
                `✅ *${type.toUpperCase()} USDT (🧪 BSC Testnet) selected.*\n\nStep 2 of 4: Enter your *exchange rate* (₹ per USDT)\n\n*Example:* \`89.50\``,
                msg
            );
            return;
        }

        // ── Step 2: Token (fallback if reached) ───────────────────────────────
        case "TOKEN": {
            draft.token = "USDT";
            draft.chain = "bsc_testnet";
            draft.step  = "RATE";
            await (db as any).setWhatsappState(user.id, "POST_AD", draft);

            await reply(
                sock,
                jid,
                `✅ *USDT (🧪 BSC Testnet) selected.*\n\nStep 2 of 4: Enter your *exchange rate* (₹ per USDT)\n\n*Example:* \`89.50\``,
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

            // ── SELL AD: Hard vault balance gate (exact same logic as MiniApp) ──
            if (draft.type === "sell" && user.wallet_address && draft.chain && draft.token) {
                try {
                    const chain = draft.chain as any;
                    let tokenAddress = env.USDT_ADDRESS;
                    if (chain === "bsc" || chain === "bsc_testnet") {
                        tokenAddress = chain === "bsc_testnet"
                            ? "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd" // BSC Testnet USDT
                            : "0x55d398326f99059fF775485246999027B3197955"; // BSC Mainnet USDT
                    }

                    const vaultStr  = await escrow.getVaultBalance(user.wallet_address, tokenAddress, chain);
                    const vaultBal  = parseFloat(vaultStr);
                    const reserved  = await (db as any).getReservedAmount(user.id, draft.token, draft.chain);
                    const available = vaultBal - reserved;

                    if (available < amount - 0.000001) {
                        await (db as any).clearWhatsappState(user.id);
                        await replyWithButtons(
                            sock,
                            jid,
                            `❌ *INSUFFICIENT VAULT BALANCE*

You need *${amount} USDT* on ${draft.chain!.toUpperCase()} but only *${available.toFixed(2)} USDT* is available.

💰 *Vault Balance:* ${vaultBal.toFixed(2)} USDT
🔒 *Already Reserved by Other Ads:* ${reserved.toFixed(2)} USDT
📊 *Available:* ${available.toFixed(2)} USDT

Please deposit more USDT and lock it to your Vault before posting this ad.`,
                            [
                                { id: "/deposit",      label: "📥 Deposit USDT" },
                                { id: "vault_deposit", label: "🔒 Lock to Vault" },
                                { id: "/post",         label: "🔄 Try Again" },
                            ]
                        );
                        return;
                    }
                } catch (rpcErr: any) {
                    console.warn("[WA-AdPost] Vault balance check failed (RPC error), proceeding:", rpcErr?.message);
                    // RPC temporarily down — allow through, the liquidity sync job will catch any discrepancy
                }
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
                `✅ *Amount: ${amount} USDT (Total: ₹${totalFiat.toLocaleString("en-IN")})*\n\nStep 5: Select *Payment Method*:`,
                [
                    { id: "ad_pay_upi",    label: "📱 UPI (GPay/PhonePe)" },
                    { id: "ad_pay_imps",   label: "🏦 Bank Transfer / IMPS" },
                    { id: "ad_pay_more",   label: "▶️ More (CDM / e-Rupee)" },
                ]
            );
            return;
        }

        // ── Step 5: Payment ───────────────────────────────────────────────────
        case "PAYMENT": {
            if (text.includes("more") || text === "ad_pay_more") {
                await replyWithButtons(
                    sock,
                    jid,
                    `💳 *MORE PAYMENT METHODS*\n\nSelect your preferred option:`,
                    [
                        { id: "ad_pay_cdm",    label: "🏧 CDM Cash Deposit" },
                        { id: "ad_pay_erupee", label: "📲 Digital e-Rupee" },
                        { id: "ad_pay_all",    label: "🔄 All Payment Methods" },
                    ]
                );
                return;
            }

            let methods: string[] = [];
            if (text.includes("cdm"))            methods.push("CDM");
            else if (text.includes("erupee"))    methods.push("DIGITAL_RUPEE");
            else if (text.includes("all"))        methods = ["UPI", "IMPS", "BANK", "CDM", "DIGITAL_RUPEE"];
            else if (text.includes("imps") || text.includes("bank")) methods.push("BANK");
            else methods.push("UPI");

            draft.payment_methods = methods;
            draft.step = "EXPIRY";
            await (db as any).setWhatsappState(user.id, "POST_AD", draft);

            await replyWithButtons(
                sock,
                jid,
                `✅ *Payment Method: ${methods.join(", ")}*\n\n⚙️ *ADVANCED SETTING — Ad Expiry Time*:\nHow long should this ad remain active?`,
                [
                    { id: "ad_exp_60",   label: "⏱️ 1 Hour" },
                    { id: "ad_exp_120",  label: "⏱️ 2 Hours" },
                    { id: "ad_exp_1440", label: "⏱️ 24 Hours" },
                ]
            );
            return;
        }

        // ── Step 6: Expiry ────────────────────────────────────────────────────
        case "EXPIRY": {
            let mins = 60;
            if (text.includes("120") || text.includes("2 h")) mins = 120;
            if (text.includes("1440") || text.includes("24 h")) mins = 1440;

            draft.expiry_minutes = mins;
            draft.step = "KYC_REQ";
            await (db as any).setWhatsappState(user.id, "POST_AD", draft);

            await replyWithButtons(
                sock,
                jid,
                `✅ *Expiry: ${mins >= 60 ? `${mins / 60} Hour(s)` : `${mins} Mins`}*\n\n⚙️ *ADVANCED SETTING — KYC Requirement Filter*:\nWho is allowed to trade on this ad?`,
                [
                    { id: "ad_kyc_yes", label: "🛡️ KYC Verified Traders Only" },
                    { id: "ad_kyc_no",  label: "🌐 All Traders Allowed" },
                ]
            );
            return;
        }

        // ── Step 7: KYC Filter ────────────────────────────────────────────────
        case "KYC_REQ": {
            const requireKyc = text.includes("yes") || text.includes("kyc_yes") || text.includes("verified");
            draft.require_kyc = requireKyc;
            draft.step = "NOTE";
            await (db as any).setWhatsappState(user.id, "POST_AD", draft);

            await replyWithButtons(
                sock,
                jid,
                `✅ *KYC Filter: ${requireKyc ? "🛡️ Verified Traders Only" : "🌐 All Traders"}*\n\n⚙️ *ADVANCED SETTING — Trader Note (Optional)*:\nReply with special terms (e.g. \`UPI transfer only, no third party payment\`) or tap Skip Note:`,
                [
                    { id: "ad_note_skip", label: "⏭️ Skip Trader Note" },
                ]
            );
            return;
        }

        // ── Step 8: Trader Note → Confirm ─────────────────────────────────────
        case "NOTE": {
            if (!text.includes("skip")) {
                draft.note = text.trim();
            }
            draft.step = "CONFIRM";
            await (db as any).setWhatsappState(user.id, "POST_AD", draft);

            const totalFiat = Math.round((draft.amount || 0) * (draft.rate || 0));

            await replyWithButtons(
                sock,
                jid,
                `📋 *CONFIRM YOUR AD (ADVANCED SETTINGS)*

• *Type:* ${draft.type!.toUpperCase()} USDT
• *Token:* USDT (${draft.chain!.toUpperCase()})
• *Amount:* ${draft.amount} USDT
• *Rate:* ₹${draft.rate} / USDT
• *Total Fiat:* ₹${totalFiat.toLocaleString("en-IN")}
• *Payment:* ${draft.payment_methods!.join(", ")}
• *Expiry:* ${draft.expiry_minutes ? `${draft.expiry_minutes / 60}h` : "1h"}
• *KYC Filter:* ${draft.require_kyc ? "🛡️ Verified Only" : "🌐 All Traders"}
${draft.note ? `• *Note:* _${draft.note}_` : ""}

Where do you want to publish this ad? 👇`,
                [
                    { id: "ad_pub_both", label: "🌐 Publish on Both (WA + TG)" },
                    { id: "ad_pub_wa",   label: "📲 WhatsApp Groups Only" },
                    { id: "ad_pub_tg",   label: "✈️ Telegram Groups Only" },
                ]
            );
            return;
        }

        // ── Step 9: Final Publish ──────────────────────────────────────────────
        case "CONFIRM": {
            if (text.includes("no") || text.includes("cancel")) {
                await (db as any).clearWhatsappState(user.id);
                await reply(sock, jid, "❌ Ad creation cancelled.", msg);
                return;
            }

            try {
                const orderAmount = draft.amount || draft.max_amount || 100;
                const totalFiat = Math.round(orderAmount * (draft.rate || 0));

                // ── FINAL VAULT RE-VALIDATION before writing to DB (TOCTOU guard) ──
                // Time may have passed since AMOUNT step — re-check in case user withdrew.
                if (draft.type === "sell" && user.wallet_address && draft.chain && draft.token) {
                    try {
                        const chain = draft.chain as any;
                        let tokenAddress = env.USDT_ADDRESS;
                        if (chain === "bsc" || chain === "bsc_testnet") {
                            tokenAddress = chain === "bsc_testnet"
                                ? "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"
                                : "0x55d398326f99059fF775485246999027B3197955";
                        }
                        const vaultStr  = await escrow.getVaultBalance(user.wallet_address, tokenAddress, chain);
                        const vaultBal  = parseFloat(vaultStr);
                        const reserved  = await (db as any).getReservedAmount(user.id, draft.token, draft.chain);
                        const available = vaultBal - reserved;

                        if (available < orderAmount - 0.000001) {
                            await (db as any).clearWhatsappState(user.id);
                            await replyWithButtons(
                                sock,
                                jid,
                                `❌ *VAULT BALANCE CHANGED*

Your available vault balance has changed since you started. You now only have *${available.toFixed(2)} USDT* available but this ad requires *${orderAmount} USDT*.

Please top up your Vault and try again.`,
                                [
                                    { id: "/deposit",      label: "📥 Deposit USDT" },
                                    { id: "vault_deposit", label: "🔒 Lock to Vault" },
                                    { id: "/post",         label: "🔄 Try Again" },
                                ]
                            );
                            return;
                        }
                    } catch (_) {
                        // RPC down — allow through, liquidity sync job will catch discrepancy
                    }
                }

                let expiresAt: string | undefined;
                if (draft.expiry_minutes && draft.expiry_minutes > 0) {
                    const now = new Date();
                    now.setMinutes(now.getMinutes() + draft.expiry_minutes);
                    expiresAt = now.toISOString();
                }

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
                    expires_at:      expiresAt,
                    source:          "whatsapp",
                    payment_details: {
                        require_kyc: Boolean(draft.require_kyc),
                        note: draft.note || undefined,
                    },
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
• *KYC Filter:* ${draft.require_kyc ? "🛡️ Verified Only" : "🌐 All Traders"}
• *Published To:* ${channelText}

Traders can now find and trade with you! 🚀`,
                    [
                        { id: "/my_ads",  label: "📋 My Ads" },
                        { id: "/ads",     label: "📊 Browse Ads" },
                    ]
                );

                // Broadcast to selected channels
                const fullOrder = { ...order, users: user, source: "whatsapp" };

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

/** Renders 1 dedicated card per ad on /my_ads with dedicated Delete/Pause quick-reply buttons */
export async function showMyAdCard(
    sock: WASocket,
    jid: string,
    msg: IWebMessageInfo,
    user: User,
    pageIndex: number = 0
): Promise<void> {
    const myOrders = await db.getOrdersByUserId(user.id);
    if (myOrders.length === 0) {
        await replyWithButtons(sock, jid, "📋 *You have no active ads.*\n\nPost one now with /post 🚀", [
            { id: "/post", label: "➕ Post New Ad" },
            { id: "/ads",  label: "📊 Browse Ads" },
        ]);
        return;
    }

    const safeIndex = Math.max(0, Math.min(pageIndex, myOrders.length - 1));
    const ad = myOrders[safeIndex];
    const shortId = ad.id.slice(0, 8);
    const totalFiat = Math.round((ad.amount || 0) * (ad.rate || 0));

    const cardText =
`📋 *YOUR P2P AD (${safeIndex + 1} of ${myOrders.length})*

• *Type:* ${ad.type.toUpperCase()} USDT
• *Rate:* ₹${ad.rate} / USDT
• *Amount:* ${ad.amount} USDT (Total: ₹${totalFiat.toLocaleString("en-IN")})
• *Status:* 🟢 ACTIVE
• *Chain:* ${(ad.chain || "BSC").toUpperCase()}
• *Payment:* ${(ad.payment_methods ?? []).join(", ") || "UPI"}
• *Ad ID:* \`${shortId}\`

👉 Shortcut: \`/delete_${shortId}\``;

    const buttons: { id: string; label: string }[] = [
        { id: `/delete_${shortId}`, label: "🗑️ Delete This Ad" },
        { id: "/post",              label: "➕ Post New Ad" },
    ];

    if (myOrders.length > 1) {
        if (safeIndex < myOrders.length - 1) {
            buttons.push({ id: `my_ads_page_${safeIndex + 1}`, label: "▶️ Next Ad" });
        } else {
            buttons.push({ id: "my_ads_page_0", label: "⏮️ First Ad" });
        }
    } else {
        buttons.push({ id: "/ads", label: "📊 Browse Ads" });
    }

    await replyWithButtons(sock, jid, cardText, buttons);

    await new Promise((r) => setTimeout(r, 250));

    // Message 2: Universal Navigation Bar
    await replyWithButtons(sock, jid, `🧭 *NAVIGATION MENU*`, [
        { id: "/start",   label: "🏠 Main Menu" },
        { id: "/profile", label: "👤 My Profile" },
        { id: "/balance", label: "💰 View Balance" },
    ]);
}
