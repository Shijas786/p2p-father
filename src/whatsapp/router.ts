/**
 * P2PFather WhatsApp Message Router
 */

import type { WASocket, IWebMessageInfo, WAMessage } from "./types";
import type { User } from "../types";
import { db } from "../db/client";
import { handleWalletCommand } from "./handlers/wallet";
import { handleAdCommand } from "./handlers/ads";
import { handleTradeCommand } from "./handlers/trade";
import { handleProfileCommand } from "./handlers/profile";
import { handleGroupMention } from "./handlers/group";
import { MAIN_MENU, formatTraderContact } from "./formatters";
import { ai } from "../services/ai";
import { env } from "../config/env";
import { evolutionClient } from "./evolutionClient";
import { hypermeowClient } from "./hypermeowClient";

function extractText(msg: IWebMessageInfo): string {
    // interactiveResponseMessage: fired when user taps a native nativeFlow button
    const nativeTap = (msg.message?.interactiveResponseMessage as any)
        ?.nativeFlowResponseMessage?.paramsJson;
    if (nativeTap) {
        try {
            const parsed = JSON.parse(nativeTap);
            if (parsed?.id) return String(parsed.id).trim();
        } catch { /* ignore */ }
    }
    return (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.buttonsResponseMessage?.selectedButtonId ||
        msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        ""
    ).trim();
}

function getBotJid(sock: WASocket): string {
    return (sock.user?.id ?? "").split(":")[0] + "@s.whatsapp.net";
}

export async function reply(
    sock: WASocket,
    jid: string,
    text: string,
    quoted?: IWebMessageInfo
): Promise<void> {
    if (hypermeowClient.isConfigured()) {
        await hypermeowClient.sendText(jid, text);
        return;
    }
    if (evolutionClient.isConfigured()) {
        await evolutionClient.sendText(jid, text);
        return;
    }
    const opts = quoted ? { quoted: quoted as WAMessage } : undefined;
    await sock.sendMessage(jid, { text }, opts);
}

export async function replyWithButtons(
    sock: WASocket,
    jid: string,
    text: string,
    buttons: { id: string; label: string }[],
    footer = "P2PFather Escrow Exchange"
): Promise<void> {
    if (hypermeowClient.isConfigured()) {
        await hypermeowClient.sendButtons(jid, text, buttons, footer);
        return;
    }
    if (evolutionClient.isConfigured()) {
        await evolutionClient.sendButtons(jid, text, buttons, footer);
        return;
    }

    // ── WhatsApp hard limit: quick_reply supports max 3 buttons ──────────────
    const nativeButtons = buttons.slice(0, 3);
    if (buttons.length > 3) {
        console.warn(`[WA] replyWithButtons: ${buttons.length} buttons requested — truncating to 3 for native quick_reply. Use replyWithList() for >3 options.`);
    }

    // ── Try native interactive buttons (max 3, WhatsApp limitation) ──────────
    if (nativeButtons.length > 0) {
        try {
            await sock.sendMessage(jid, {
                interactiveMessage: {
                    body: { text },
                    footer: { text: footer },
                    header: { hasMediaAttachment: false },
                    nativeFlowMessage: {
                        messageVersion: 1,
                        buttons: nativeButtons.map((b) => ({
                            name: "quick_reply",
                            buttonParamsJson: JSON.stringify({
                                display_text: b.label,
                                id: b.id,
                            }),
                        })),
                    },
                },
            } as any);
            return;
        } catch (err: any) {
            console.warn("[WA] Native buttons failed, falling back to text:", err?.message);
        }
    }

    // ── Fallback: numbered text options (always works) ────────────────────────
    let formattedText = text;
    if (buttons.length > 0) {
        const divider = "━━━━━━━━━━━━━━━━━━━━";
        const optionLines = buttons.map((b, i) => {
            const num = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"][i] ?? `${i + 1}.`;
            return `${num} ${b.label}`;
        });
        formattedText += `\n\n${divider}\n💬 *Reply with a number to continue:*\n${optionLines.join("\n")}\n${divider}\n_${footer}_`;
    }
    try {
        await sock.sendMessage(jid, { text: formattedText });
    } catch (err: any) {
        console.error("[WA] sendMessage failed:", err?.message);
    }
}

export async function replyWithCarousel(
    sock: WASocket,
    jid: string,
    text: string,
    cards: {
        title: string;
        body: string;
        footer?: string;
        buttons: { id: string; label: string }[];
    }[]
): Promise<void> {
    try {
        const divider = "━━━━━━━━━━━━━━━━━━━━";
        let formattedText = `${text}\n\n${divider}\n`;
        cards.forEach((c, idx) => {
            const num = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"][idx] ?? `${idx + 1}.`;
            formattedText += `${num} *${c.title}*\n_${c.body}_\n`;
            if (c.buttons.length > 0) {
                formattedText += `   👉 Reply \`${c.buttons[0].id}\` to select\n`;
            }
            formattedText += `\n`;
        });
        formattedText += divider;
        await sock.sendMessage(jid, { text: formattedText.trim() });
    } catch (err: any) {
        console.error("[WA] Carousel sendMessage failed:", err?.message);
    }
}

export async function replyWithList(
    sock: WASocket,
    jid: string,
    text: string,
    buttonTitle: string,
    sections: {
        title: string;
        rows: { id: string; title: string; description?: string }[];
    }[],
    footer = "P2PFather Escrow Exchange"
): Promise<void> {
    if (hypermeowClient.isConfigured()) {
        const ok = await hypermeowClient.sendList(jid, text, buttonTitle, sections);
        if (ok) return;
    }
    if (evolutionClient.isConfigured()) {
        const ok = await evolutionClient.sendList(jid, text, buttonTitle, sections, footer);
        if (ok) return;
    }

    // ── Try native single_select list picker (unlimited rows, DM only) ────────
    try {
        await sock.sendMessage(jid, {
            interactiveMessage: {
                body: { text },
                footer: { text: footer },
                header: { hasMediaAttachment: false },
                nativeFlowMessage: {
                    messageVersion: 1,
                    buttons: [
                        {
                            name: "single_select",
                            buttonParamsJson: JSON.stringify({
                                title: buttonTitle,
                                sections: sections.map((s) => ({
                                    title: s.title,
                                    rows: s.rows.map((r) => ({
                                        id: r.id,
                                        title: r.title,
                                        description: r.description ?? "",
                                    })),
                                })),
                            }),
                        },
                    ],
                },
            },
        } as any);
        return;
    } catch (err: any) {
        console.warn("[WA] Native list failed, falling back to text:", err?.message);
    }

    // ── Fallback: formatted text list (always works) ──────────────────────────
    const divider = "━━━━━━━━━━━━━━━━━━━━";
    let formattedText = `${text}\n\n${divider}\n📋 *${buttonTitle}*\n`;
    let rowCounter = 1;
    sections.forEach((s) => {
        formattedText += `\n📌 *${s.title}*\n`;
        s.rows.forEach((r) => {
            const num = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"][rowCounter - 1] ?? `${rowCounter}.`;
            formattedText += `${num} *${r.title}*${r.description ? ` — _${r.description}_` : ""}\n`;
            rowCounter++;
        });
    });
    formattedText += `\n${divider}\n_${footer}_`;
    try {
        await sock.sendMessage(jid, { text: formattedText.trim() });
    } catch (err: any) {
        console.error("[WA] List sendMessage failed:", err?.message);
    }
}

// ── Step 1: Welcome Screen (first message to new WA users) ───────────────────
async function showWelcomeScreen(
    sock: WASocket,
    jid: string,
    msg: IWebMessageInfo
): Promise<void> {
    await replyWithButtons(
        sock,
        jid,
        `👋 *Welcome to P2PFather!* 🇮🇳

P2PFather is India's premier *smart-contract P2P exchange* for safe crypto trading.

💱 *Buy & Sell USDT* peer-to-peer with UPI, IMPS, and bank transfers
🔒 *Escrow Protection* — your funds are locked safely on-chain
⚡ *Instant Matching* — trade directly with verified traders
🌐 *Multi-Chain* — BSC, Polygon, and Base supported

Choose how you'd like to get started 👇`,
        [
            { id: "wa_setup_newwallet",     label: "✨ Create New Wallet" },
            { id: "wa_setup_link_telegram", label: "🔗 Link Telegram" },
            { id: "wa_guide",              label: "📖 How It Works" },
        ]
    );
}

// ── Step 2: Platform Guide ────────────────────────────────────────────────────
async function showGuide(
    sock: WASocket,
    jid: string,
    msg: IWebMessageInfo
): Promise<void> {
    await replyWithButtons(
        sock,
        jid,
        `📖 *HOW P2PFATHER WORKS*

*1️⃣ Deposit USDT*
Send USDT to your P2PFather wallet (BSC/Polygon/Base). Funds are secured in smart contract escrow.

*2️⃣ Post or Browse Ads*
Browse live buy/sell ads from verified traders. Choose your rate, limits, and payment method (UPI/IMPS/Bank).

*3️⃣ Matched Trade*
When a trade is matched, USDT is locked in escrow. The buyer transfers INR directly to the seller's bank/UPI.

*4️⃣ Confirm & Release*
Seller verifies payment in their bank app ✅ → releases USDT from escrow → trade complete in minutes.

*5️⃣ Dispute Protection*
If anything goes wrong, our admin team reviews evidence and resolves within 24 hours. Escrow protects both sides.

🔒 *Your funds are NEVER held by us — only by smart contracts.*

Ready to get started? Select an option below 👇`,
        [
            { id: "wa_setup_newwallet",     label: "✨ Create New Wallet" },
            { id: "wa_setup_link_telegram", label: "🔗 Link Telegram" },
        ]
    );
}

// ── Step 3: Wallet Type Choice ────────────────────────────────────────────────
async function showWalletChoice(
    sock: WASocket,
    jid: string,
    msg: IWebMessageInfo
): Promise<void> {
    await replyWithButtons(
        sock,
        jid,
        `💳 *SET UP YOUR WALLET*

Choose how you'd like to get your P2PFather wallet:

🔗 *Link Telegram Account*
Already using P2PFather on Telegram? Connect your existing wallet, trade history, and profile. Everything carries over instantly.

✨ *Create New Wallet*
New to P2PFather? We'll create a fresh crypto wallet for you right here on WhatsApp.

_Already have a 6-digit link code from Telegram? Just send it here!_`,
        [
            { id: "wa_setup_newwallet",     label: "✨ Create New Wallet" },
            { id: "wa_setup_link_telegram", label: "🔗 Link Telegram" },
        ]
    );
}

export async function routeMessage(
    sock: WASocket,
    msg: IWebMessageInfo
): Promise<void> {
    if (!msg.key) return;
    const jid = msg.key.remoteJid;
    if (!jid) return;

    const text = extractText(msg).toLowerCase();
    const isGroup = jid.endsWith("@g.us");
    const senderJid = (isGroup ? msg.key.participant : jid) ?? "";
    const senderPhone = senderJid.split("@")[0];

    // ── Group: respond if @mentioned or keyword triggered ────────────────────
    if (isGroup) {
        const botJid = getBotJid(sock);
        const mentionedJids: string[] =
            (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid as string[]) ?? [];
        const lowerText = text.toLowerCase();
        const isMentioned =
            mentionedJids.length > 0 ||
            lowerText.includes("@bot") ||
            lowerText.includes("p2p") ||
            lowerText.includes("father") ||
            lowerText.includes("ads") ||
            lowerText.includes("rate") ||
            lowerText.includes("buy") ||
            lowerText.includes("sell") ||
            lowerText.startsWith("!p2p") ||
            lowerText.startsWith("!ads");

        if (!isMentioned) return;

        await handleGroupMention(sock, msg, jid, text);
        return;
    }

    // ── DM: get or create user ────────────────────────────────────────────────
    let user = await db.getUserByWhatsappPhone(senderPhone);
    if (!user) {
        user = await db.getOrCreateUserByPhone(senderPhone);
    }

    // ── Account Linking Command (/link 123456 or typing 6-digit code) ─────────
    const codeMatch = text.match(/\b(\d{6})\b/);
    if (text.startsWith("/link") || codeMatch) {
        const inputCode = codeMatch ? codeMatch[1] : text.replace("/link", "").trim();

        if (!inputCode || inputCode.length !== 6) {
            await reply(
                sock,
                jid,
                `🔗 *LINK ACCOUNT TO TELEGRAM / WEB MINI-APP*

To link your WhatsApp with your Telegram / MiniApp account:
1. Open MiniApp Profile or Telegram Bot
2. Get your 6-digit OTP code (e.g. \`849201\`)
3. Reply here with: \`/link 849201\` or just \`849201\``,
                msg
            );
            return;
        }

        const linkedUser = await db.linkWhatsappByCode(senderPhone, inputCode);
        if (linkedUser) {
            await reply(
                sock,
                jid,
                `🎉 *ACCOUNT LINKED SUCCESSFULLY!*

Your WhatsApp number (+${senderPhone}) is now linked to your P2PFather account!

✅ Shared P2P Wallet & History
✅ Instant Trade Alerts on Telegram & WhatsApp
✅ Single Orderbook Access`,
                msg
            );
        } else {
            await reply(
                sock,
                jid,
                `❌ *Invalid or Expired Code*

The link code you entered is invalid or has expired.
Please get a fresh code from your MiniApp Profile or Telegram Bot.`,
                msg
            );
        }
        return;
    }

    // ── Route by command ──────────────────────────────────────────────────────
    // ── Global Reset / Cancel Command ─────────────────────────────────────────
    if (text === "/cancel" || text === "cancel" || text === "cancel_trade") {
        await (db as any).clearWhatsappState(user.id);
        await reply(sock, jid, "❌ Action cancelled.\n\nType /start to view main menu.", msg);
        return;
    }

    // ── Number Shortcuts (1, 2, 3, 4, 5) ──────────────────────────────────────
    if (text === "1" || text === "1️⃣") {
        await handleWalletCommand(sock, msg, jid, senderPhone, user, "/balance");
        return;
    }
    if (text === "2" || text === "2️⃣") {
        await handleAdCommand(sock, msg, jid, user, "/ads");
        return;
    }
    if (text === "3" || text === "3️⃣") {
        await handleAdCommand(sock, msg, jid, user, "/post");
        return;
    }
    if (text === "4" || text === "4️⃣") {
        await handleTradeCommand(sock, msg, jid, user, "/trades");
        return;
    }
    if (text === "5" || text === "5️⃣") {
        await handleAdCommand(sock, msg, jid, user, "/my_ads");
        return;
    }

    // ── Explicit Welcome / Onboarding test command ────────────────────────────
    if (text === "/welcome" || text === "welcome" || text === "/onboarding") {
        await (db as any).clearWhatsappState(user.id);
        await showWelcomeScreen(sock, jid, msg);
        return;
    }

    const isGreeting = ["/start", "start", "hi", "hy", "hey", "hello", "hola", "hallo", "menu", "/help", "help", ""].includes(text);
    if (isGreeting) {
        await (db as any).clearWhatsappState(user.id);
        // New user with no wallet yet — show welcome screen
        if (!user.wallet_address) {
            await showWelcomeScreen(sock, jid, msg);
            return;
        }
        await sendTwoMessageMainMenu(sock, jid, msg, user);
        return;
    }

    // ── Onboarding button: Guide ──────────────────────────────────────────────
    if (text === "wa_guide") {
        await showGuide(sock, jid, msg);
        return;
    }

    // ── Onboarding button: Create Wallet (shows type choice) ─────────────────
    if (text === "wa_create_wallet") {
        await showWalletChoice(sock, jid, msg);
        return;
    }

    // ── Wallet Setup: new WA user chooses how to get a wallet ─────────────────
    if (text === "wa_setup_link_telegram") {
        const botUsername = process.env.TELEGRAM_BOT_USERNAME || "P2p_fatherbot";
        const botLink = `https://t.me/${botUsername}?start=linkwa`;
        await reply(
            sock,
            jid,
            `🔗 *LINK YOUR TELEGRAM ACCOUNT*

👇 *Tap the link below to open P2PFather on Telegram:*
${botLink}

Then follow these steps:

*Step 1:* The bot opens automatically — tap *Start*
*Step 2:* Go to ⚙️ *Profile* → tap *"Link WA"*
*Step 3:* A 6-digit code appears (e.g. \`849201\`)
*Step 4:* Come back here and send that code

✅ Your Telegram wallet and full trade history will carry over instantly!

_Code is valid for 10 minutes._`,
            msg
        );
        return;
    }

    if (text === "wa_setup_newwallet") {
        try {
            await reply(sock, jid, "⏳ Generating your secure multi-chain wallet...", msg);
            const updatedUser = await (db as any).assignWalletToWaUser(user.id);
            user = updatedUser;

            await replyWithButtons(
                sock,
                jid,
                `🎉 *WALLET CREATED SUCCESSFULLY!*

Your P2PFather multi-chain crypto wallet is ready 🎉

💳 *Wallet Address:*
\`${updatedUser.wallet_address}\`

🌐 *Supported Blockchains:*
• Base (USDC & USDT)
• Polygon (USDT)
• BSC (USDT)

🔒 *Security Note:* Your wallet is protected by smart-contract escrow. You can deposit, trade, or withdraw anytime.

Select an option below to start trading 👇`,
                [
                    { id: "/deposit", label: "📥 Deposit USDT" },
                    { id: "/ads",     label: "📊 Browse P2P Ads" },
                    { id: "/post",    label: "➕ Post New Ad" },
                ]
            );
        } catch (err: any) {
            await reply(sock, jid, "❌ Failed to create wallet. Please try again or type /start.", msg);
        }
        return;
    }

    // ── Gate: no wallet yet — redirect all commands to welcome screen ─────────
    if (!user.wallet_address) {
        // Allow 6-digit link codes through (handled above)
        const is6digit = /^\d{6}$/.test(text.trim());
        if (!is6digit) {
            await showWelcomeScreen(sock, jid, msg);
            return;
        }
    }

    const lowerText = text.toLowerCase().trim();

    // ── Natural language: balance check ──────────────────────────────────────
    if (
        text.startsWith("/balance") ||
        text.startsWith("/deposit") ||
        text.startsWith("/send") ||
        text.startsWith("/withdraw") ||
        text.startsWith("/vault_deposit") ||
        text.startsWith("vault_deposit") ||
        text.startsWith("confirm_vault_dep_") ||
        text.startsWith("confirm_wd_") ||
        /\b(balance|wallet|funds|my usdt|check balance|how much usdt|kithaanu|enthaanu balance|balance aano|bakki undu)\b/.test(lowerText)
    ) {
        await handleWalletCommand(sock, msg, jid, senderPhone, user, text);
        return;
    }

    // ── Natural language: send / transfer funds ───────────────────────────────
    if (
        /\b(send|transfer|withdraw|pay out|payout|ayachu|ayak|send chey|transfer chey)\b/.test(lowerText) ||
        /\bsend\s+(\d+|crypto|usdt|usdc|bnb)\b/.test(lowerText)
    ) {
        // If they have an address in the text, pass it through directly
        const hasAddress = /0x[a-fA-F0-9]{10,}/.test(text);
        if (hasAddress) {
            await handleWalletCommand(sock, msg, jid, senderPhone, user, text);
        } else {
            // Guide them to the send format
            await reply(
                sock,
                jid,
                `📤 *SEND CRYPTO*

To send funds, reply in this format:
\`/send <address> <amount> USDT <chain>\`

*Example:*
\`/send 0x742d35Cc6634... 50 USDT bsc\`

Supported chains: BSC, Polygon, Base

Or check your balance first with /balance 💰`,
                msg
            );
        }
        return;
    }

    if (
        text.startsWith("/ads") ||
        text.startsWith("/post") ||
        text.startsWith("/my_ads") ||
        text.startsWith("my_ads_page_") ||
        text.startsWith("/delete") ||
        text.startsWith("/del_") ||
        text.startsWith("/pause") ||
        text.startsWith("ad_type_") ||
        text.startsWith("ad_token_") ||
        text.startsWith("ad_pay_") ||
        text.startsWith("ad_confirm_")
    ) {
        await handleAdCommand(sock, msg, jid, user, text);
        return;
    }

    if (
        text.startsWith("trade_ad_") ||
        text.startsWith("/trades") ||
        text.startsWith("/paid_") ||
        text.startsWith("/release_") ||
        text.startsWith("/dispute_") ||
        text.startsWith("/cancel_")
    ) {
        await handleTradeCommand(sock, msg, jid, user, text);
        return;
    }

    if (
        text.startsWith("/profile") ||
        text === "profile" ||
        text.startsWith("profile_page_") ||
        text === "edit_payments_menu" ||
        text === "set_upi" ||
        text === "set_bank" ||
        text === "set_erupee"
    ) {
        await handleProfileCommand(sock, msg, jid, user, text);
        return;
    }

    // Unknown — check if user has pending state and re-route
    const state = await (db as any).getWhatsappState(user.id);
    if (state) {
        if (state.key === "POST_AD") {
            await handleAdCommand(sock, msg, jid, user, text);
            return;
        }
        if (state.key === "AWAITING_TRADE_AMOUNT") {
            await handleTradeCommand(sock, msg, jid, user, text);
            return;
        }
        if (state.key === "AWAITING_WITHDRAW_PIN") {
            await handleWalletCommand(sock, msg, jid, senderPhone, user, text);
            return;
        }
        if (
            state.key === "AWAITING_UPI_INPUT" ||
            state.key === "AWAITING_BANK_INPUT" ||
            state.key === "AWAITING_ERUPEE_INPUT"
        ) {
            await handleProfileCommand(sock, msg, jid, user, text);
            return;
        }
    }

    // ── Active Trade Chat Mediator Relay ──────────────────────────────────────
    if (!text.startsWith("/") && !text.startsWith("!")) {
        try {
            const activeTrades = await db.getActiveTradesForUser(user.id);
            if (activeTrades.length > 0) {
                const currentTrade = activeTrades[0];
                const isBuyer = currentTrade.buyer_id === user.id;
                const counterpartyId = isBuyer ? currentTrade.seller_id : currentTrade.buyer_id;
                const counterparty = await db.getUserById(counterpartyId);

                if (counterparty) {
                    const roleLabel = isBuyer ? "BUYER" : "SELLER";
                    const relayMessage = `💬 *TRADE CHAT [Trade #${currentTrade.id.slice(0, 8)}]*\n*From ${roleLabel}:*\n"${text}"`;

                    const { sendUserAlert } = await import("../services/notifier");
                    await sendUserAlert(counterparty, relayMessage);

                    await reply(
                        sock,
                        jid,
                        `💬 *Message delivered to ${isBuyer ? "Seller" : "Buyer"}!*`,
                        msg
                    );
                    return;
                }
            }
        } catch (err) {
            console.error("[WA-TradeChat] Error in relaying trade message:", err);
        }
    }

    // ── AI-powered natural language guide (private DM only) ───────────────────
    if (env.OPENAI_API_KEY) {
        try {
            const intent = await ai.parseIntent(lowerText);

            // Route known intents to handlers
            if (intent.intent === "CHECK_BALANCE") {
                await handleWalletCommand(sock, msg, jid, senderPhone, user, "/balance");
                return;
            }
            if (intent.intent === "SEND_CRYPTO") {
                await reply(
                    sock,
                    jid,
                    `📤 *SEND CRYPTO*

To send, reply in this format:
\`/send <address> <amount> USDT <chain>\`

*Example:*
\`/send 0x742d35Cc6634... 50 USDT bsc\`

Check balance first: /balance 💰`,
                    msg
                );
                return;
            }
            if (intent.intent === "VIEW_ORDERS") {
                await handleAdCommand(sock, msg, jid, user, "/ads");
                return;
            }
            if (intent.intent === "HELP" || intent.intent === "UNKNOWN") {
                // Return friendly AI response
                if (intent.response && intent.intent === "HELP") {
                    await reply(sock, jid, `🤖 ${intent.response}\n\nType /start to see all commands.`, msg);
                    return;
                }
                await replyWithButtons(
                    sock,
                    jid,
                    MAIN_MENU,
                    [
                        { id: "/balance", label: "💰 Balance & Wallet" },
                        { id: "/ads",     label: "📊 Browse P2P Ads" },
                        { id: "/post",    label: "➕ Post New Ad" },
                    ]
                );
                return;
            }
            // For any other known intent, show the AI's response and the menu
            if (intent.response) {
                await reply(sock, jid, `🤖 ${intent.response}\n\nType /start to see all commands.`, msg);
                return;
            }
        } catch (_) {
            // AI failed — fallthrough to default
        }
    }

    await reply(
        sock,
        jid,
        `❓ I didn't understand that.\n\nType /start to see the main menu.`,
        msg
    );
}

/** Renders a stacked 2-message 6-button main menu dashboard */
export async function sendTwoMessageMainMenu(
    sock: WASocket,
    jid: string,
    msg: IWebMessageInfo,
    user: User
): Promise<void> {
    const handle = formatTraderContact(user);
    const walletAddr = user.wallet_address
        ? `\`${user.wallet_address.slice(0, 6)}...${user.wallet_address.slice(-4)}\``
        : "Not created";

    const topMessageText =
`🎩 *P2PFATHER — INSTANT P2P CRYPTO EXCHANGE*

Welcome back, *${handle}*! 🛡️

• *P2P Wallet:* ${walletAddr}
• *Networks:* Base & BSC (USDT)
• *Security:* 100% Smart-Contract Escrow

Choose an action from the menu below:`;

    // Message 1 (Frame 1: 3 Buttons)
    await replyWithButtons(
        sock,
        jid,
        topMessageText,
        [
            { id: "/balance", label: "💰 Balance & Vault" },
            { id: "/ads",     label: "📊 Browse P2P Ads" },
            { id: "/post",    label: "➕ Post New Ad" },
        ]
    );

    // Short 250ms gap so messages arrive stacked seamlessly
    await new Promise((r) => setTimeout(r, 250));

    // Message 2 (Frame 2: 3 Buttons)
    await replyWithButtons(
        sock,
        jid,
        `⚡ *QUICK ACCOUNT ACTIONS & TRADES*`,
        [
            { id: "/trades",  label: "📜 Active Trades" },
            { id: "/my_ads",  label: "📋 My Ads" },
            { id: "/profile", label: "👤 My Profile" },
        ]
    );
}
