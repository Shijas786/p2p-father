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
import { handleGroupMention, scanAndDeleteSpam } from "./handlers/group";
import { MAIN_MENU, formatTraderContact } from "./formatters";
import { waAi as ai } from "../services/wa-ai";
import { env } from "../config/env";
import { hypermeowClient } from "./hypermeowClient";
import { wallet } from "../services/wallet";

function extractText(msg: IWebMessageInfo): string {
    // interactiveResponseMessage: fired when user taps a native nativeFlow button
    const nativeTap = (msg.message?.interactiveResponseMessage as any)
        ?.nativeFlowResponseMessage?.paramsJson;
    if (nativeTap) {
        try {
            const parsed = JSON.parse(nativeTap);
            if (parsed.id) return parsed.id.trim();
        } catch (_) {}
    }
    return (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.buttonsResponseMessage?.selectedButtonId ||
        msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        (msg.message as any)?.templateButtonReplyMessage?.selectedId ||
        ""
    ).trim();
}

export function getCleanSenderJid(sock: WASocket, msg: IWebMessageInfo): string {
    const rawJid = msg.key?.remoteJid || "";
    if (rawJid.endsWith("@g.us")) return rawJid;
    const participant = msg.key?.participant || (msg as any).participant || "";
    if (participant) return participant.split(":")[0] + "@s.whatsapp.net";
    return rawJid.split(":")[0] + "@s.whatsapp.net";
}

export function getCleanBotJid(sock: WASocket): string {
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
    const opts = quoted ? { quoted: quoted as WAMessage } : undefined;
    await sock.sendMessage(jid, { text }, opts);
}

export async function replyWithButtons(
    sock: WASocket,
    jid: string,
    text: string,
    buttons: { id: string; label: string; url?: string }[],
    footer = "P2PFather Escrow Exchange",
    quoted?: IWebMessageInfo
): Promise<void> {
    if (hypermeowClient.isConfigured()) {
        await hypermeowClient.sendButtons(jid, text, buttons, footer);
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
                buttons: nativeButtons.map((b) => ({
                    buttonId: b.id,
                    buttonText: { displayText: b.label },
                    type: 1,
                })),
                headerType: 1,
                text,
                footer,
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
            if (b.url || b.id.startsWith("http")) {
                const targetUrl = b.url || b.id;
                return `${num} ${b.label}:\n   👉 ${targetUrl}`;
            }
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
        `👋 *WELCOME TO P2PFATHER!* 🎩

P2PFather is India's premier *smart-contract P2P exchange* for safe, escrow-protected crypto trading.

💱 *Buy & Sell USDT* peer-to-peer with UPI, IMPS, and Bank Transfers
🔒 *Smart-Contract Escrow* — 100% on-chain protection
⚡ *Instant Automated Settlement* on BSC, Base & Polygon

*How would you like to get started?* 👇
• *Link Telegram:* Carry over your existing wallet & trade history!
• *Create New Wallet:* Instant 1-tap wallet + *1,000 Demo USDT & 0.05 BNB Gas Fee* credited!`,
        [
            { id: "wa_setup_link_telegram", label: "🔗 Link Telegram Wallet" },
            { id: "wa_setup_newwallet",     label: "✨ Create New Wallet" },
            { id: "wa_guide",              label: "📖 Platform Guide" },
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
        // 🛡️ SPAM GUARD: always scan every group message first (no mention required)
        const wasSpam = await scanAndDeleteSpam(sock, msg, jid);
        if (wasSpam) return; // Stop processing — message was spam

        const botJid = getCleanBotJid(sock);
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
    console.log(`[WA-Router] 📩 Incoming DM from ${senderPhone}: "${text}"`);
    let user = await db.getUserByWhatsappPhone(senderPhone);
    if (!user) {
        user = await db.getOrCreateUserByPhone(senderPhone);
    }

    // ── Persist/refresh pushName (WhatsApp display name) whenever it changes ──
    const pushName = msg.pushName?.trim();
    if (pushName && user && user.first_name !== pushName) {
        try {
            await db.getClient().from("users").update({ first_name: pushName }).eq("id", user.id);
            user.first_name = pushName;
        } catch (_) {}
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

    // ── Web Dashboard & OTP Login Command (/web, /dashboard, /login, /app) ────
    if (text === "/web" || text === "/dashboard" || text === "/login" || text === "/app" || text.includes("dashboard")) {
        await (db as any).clearWhatsappState(user.id);
        const { waOtpService } = await import("../services/wa-otp");
        const otpResult = await waOtpService.sendOtp(senderPhone);

        const webUrl = `https://p2pfather.com/webapp`;

        await reply(
            sock,
            jid,
            `🌐 *P2PFATHER WEB DASHBOARD*

${otpResult.message}

📲 *Access Web Dashboard:*
${webUrl}

_Enter your phone number (+${senderPhone}) and the OTP code above on the web dashboard to log in!_`,
            msg
        );
        return;
    }

    // ── Route by command ──────────────────────────────────────────────────────
    // ── Global Reset / Cancel Command ─────────────────────────────────────────
    if (text === "/cancel" || text === "cancel" || text === "cancel_trade") {
        await (db as any).clearWhatsappState(user.id);
        await reply(sock, jid, "❌ Action cancelled.\n\nType /start to view main menu.", msg);
        return;
    }

    // ── Direct Quick-Reply Button Click Matching (with emojis & labels) ───────
    if (text.includes("browse ads") || text.includes("browse ad") || text === "/ads" || text === "ads") {
        await (db as any).clearWhatsappState(user.id);
        await handleAdCommand(sock, msg, jid, user, "/ads");
        return;
    }
    if (text.includes("wallet balance") || text.includes("view balance") || text === "/balance" || text === "balance") {
        await (db as any).clearWhatsappState(user.id);
        await handleWalletCommand(sock, msg, jid, senderPhone, user, "/balance");
        return;
    }
    if (text.includes("top up vault") || text.includes("lock to vault") || text === "vault_deposit" || text === "/vault") {
        await (db as any).clearWhatsappState(user.id);
        await handleWalletCommand(sock, msg, jid, senderPhone, user, "vault_deposit");
        return;
    }
    if (text.includes("create ad") || text.includes("post new ad") || text.includes("post my ad") || text.includes("post ad") || text === "/post" || text === "post") {
        await (db as any).clearWhatsappState(user.id);
        await handleAdCommand(sock, msg, jid, user, "/post");
        return;
    }
    if (text.includes("my ads") || text.includes("my ad") || text === "/my_ads" || text === "my_ads") {
        await (db as any).clearWhatsappState(user.id);
        await handleAdCommand(sock, msg, jid, user, "/my_ads");
        return;
    }
    if (text.includes("profile") || text === "/profile") {
        await (db as any).clearWhatsappState(user.id);
        await handleProfileCommand(sock, msg, jid, user, "/profile");
        return;
    }
    if (text.includes("deposit usdt") || text === "/deposit" || text === "deposit") {
        await (db as any).clearWhatsappState(user.id);
        await handleWalletCommand(sock, msg, jid, senderPhone, user, "/deposit");
        return;
    }

    // ── Number Shortcuts (1, 2, 3, 4, 5) ──────────────────────────────────────
    if (text === "1" || text === "1️⃣") {
        await (db as any).clearWhatsappState(user.id);
        await handleWalletCommand(sock, msg, jid, senderPhone, user, "/balance");
        return;
    }
    if (text === "2" || text === "2️⃣") {
        await (db as any).clearWhatsappState(user.id);
        await handleAdCommand(sock, msg, jid, user, "/ads");
        return;
    }
    if (text === "3" || text === "3️⃣") {
        await (db as any).clearWhatsappState(user.id);
        await handleAdCommand(sock, msg, jid, user, "/post");
        return;
    }
    if (text === "4" || text === "4️⃣") {
        await (db as any).clearWhatsappState(user.id);
        await handleTradeCommand(sock, msg, jid, user, "/trades");
        return;
    }
    if (text === "5" || text === "5️⃣") {
        await (db as any).clearWhatsappState(user.id);
        await handleAdCommand(sock, msg, jid, user, "/my_ads");
        return;
    }

    // ── Faucet Command for Testnet Testing ────────────────────────────
    if (text === "/faucet" || text === "faucet" || text.includes("testnet faucet") || text.includes("faucet")) {
        await handleWalletCommand(sock, msg, jid, senderPhone, user, "/faucet");
        return;
    }

    // ── Explicit Welcome / Onboarding test command ────────────────────────────
    if (text === "/welcome" || text === "welcome" || text === "/onboarding") {
        await (db as any).clearWhatsappState(user.id);
        await showWelcomeScreen(sock, jid, msg);
        return;
    }

    const isRegistration = text.includes("register") || text.includes("sign up") || text.includes("signup") || text.includes("i want to register");
    const isGreeting = isRegistration || ["/start", "start", "hi", "hy", "hey", "hello", "hola", "hallo", "menu", "/help", "help", ""].includes(text);
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
    if (text === "wa_guide" || text.includes("how it works") || text.includes("guide")) {
        await showGuide(sock, jid, msg);
        return;
    }

    // ── Onboarding button: Create Wallet (shows type choice) ─────────────────
    if (text === "wa_create_wallet") {
        await showWalletChoice(sock, jid, msg);
        return;
    }

    // ── Wallet Setup: new WA user chooses how to get a wallet ─────────────────
    if (text === "wa_setup_link_telegram" || text.includes("link telegram")) {
        if (user.telegram_id || user.wallet_address) {
            await reply(sock, jid, "✅ *Your account is already linked and your wallet is ready!*", msg);
            await sendTwoMessageMainMenu(sock, jid, msg, user);
            return;
        }

        const botUsername = process.env.TELEGRAM_BOT_USERNAME || process.env.BOT_USERNAME || "p2p_fatherbot";
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

    if (text === "wa_setup_newwallet" || text.includes("create new wallet") || text.includes("new wallet")) {
        if (user.wallet_address) {
            await reply(sock, jid, "✅ *You already have a wallet set up!*", msg);
            await sendTwoMessageMainMenu(sock, jid, msg, user);
            return;
        }

        try {
            await reply(sock, jid, "⏳ Generating your secure multi-chain wallet & crediting Testnet USDT...", msg);
            const updatedUser = await (db as any).assignWalletToWaUser(user.id);
            user = updatedUser;

            // 🚀 Automatic Faucet: Mint 1,000 Demo USDT + 0.05 tBNB Gas Fee on BSC Testnet
            if (updatedUser.wallet_address) {
                wallet.dispenseAutoTestnetFaucet(updatedUser.wallet_address).then(async (res: any) => {
                    console.log(`[AutoFaucet] Credited 1,000 USDT + 0.05 BNB to ${updatedUser.wallet_address}`);
                    const supabase = db.getClient();
                    const cache = (updatedUser as any).predictions_cache || {};
                    await supabase.from("users").update({
                        predictions_cache: {
                            ...cache,
                            testnet_usdt: res.usdt || "1000.00",
                            testnet_bnb: res.bnb || "0.05"
                        }
                    } as any).eq("id", updatedUser.id);
                }).catch((err: any) => console.error("[AutoFaucet Error]:", err));
            }

            await replyWithButtons(
                sock,
                jid,
                `🎉 *WALLET CREATED SUCCESSFULLY!*

Your P2PFather multi-chain crypto wallet is ready 🎉

💳 *Wallet Address:*
\`${updatedUser.wallet_address}\`

🧪 *Testnet Balance Credited:*
• *1,000.00 USDT* (BSC Testnet)
• *0.05 BNB* (Gas fee)

🔒 *Security Note:* Your wallet is protected by smart-contract escrow. You can deposit, trade, or withdraw anytime.

Select an option below to start trading 👇`,
                [
                    { id: "/deposit", label: "📥 Deposit USDT" },
                    { id: "https://p2pfather.com/webapp", url: "https://p2pfather.com/webapp", label: "🌐 Web Dashboard" },
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

    // ── Check active trade chat state ─────────────────────────────────────────
    const chatState = await (db as any).getWhatsappState(user.id);
    if (chatState?.key?.startsWith("IN_TRADE_CHAT_")) {
        const tradeId = chatState.key.replace("IN_TRADE_CHAT_", "");

        if (text === "exit_trade_chat" || text === "/start" || text === "menu" || text === "/trades") {
            await (db as any).clearWhatsappState(user.id);
            if (text === "exit_trade_chat") {
                await replyWithButtons(sock, jid, "🚪 Exited trade chat.", [
                    { id: "/start",   label: "🏠 Main Menu" },
                    { id: "/trades",  label: "📜 Active Trades" },
                ]);
                return;
            }
        } else {
            // Relay message directly to counterparty
            const counterpartyId = chatState.data?.counterpartyId;
            if (counterpartyId) {
                const counterparty = await db.getUserById(counterpartyId);
                if (counterparty) {
                    const trade = await db.getTradeById(tradeId);
                    const shortId = tradeId.slice(0, 5).toUpperCase();

                    const isCounterpartySeller = trade?.seller_id === counterparty.id;

                    const alertButtons: { id: string; label: string }[] = [
                        { id: `/chat_${tradeId}`, label: "💬 Reply in Chat" },
                    ];

                    if (isCounterpartySeller && (trade?.status === "in_escrow" || trade?.status === "fiat_sent")) {
                        alertButtons.push({ id: `/release_${tradeId}`, label: "🔓 Confirm Release" });
                    }

                    alertButtons.push({ id: "/trades", label: "📜 Active Trades" });

                    const { sendUserAlert } = await import("../services/notifier");
                    await sendUserAlert(
                        counterparty,
                        `💬 *TRADE CHAT (#PF-${shortId})*\n\n*${formatTraderContact(user)}:* ${text}`,
                        undefined,
                        alertButtons.slice(0, 3)
                    );
                    await reply(sock, jid, "✅ Message delivered to counterparty!", msg);
                    return;
                }
            }
        }
    }

    // ── Natural language: balance check ──────────────────────────────────────
    if (
        text.startsWith("/balance") ||
        text.startsWith("/deposit") ||
        text.startsWith("/send") ||
        text.startsWith("/withdraw") ||
        text.startsWith("/vault_deposit") ||
        text.startsWith("vault_deposit") ||
        text.startsWith("vdep_chain_") ||
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

    const cleanTradeCmd = text.startsWith("/") ? text.slice(1) : text;
    if (
        cleanTradeCmd.startsWith("trade_ad_") ||
        cleanTradeCmd.startsWith("confirm_trade_") ||
        cleanTradeCmd === "trades" ||
        cleanTradeCmd.startsWith("paid_") ||
        cleanTradeCmd.startsWith("release_") ||
        cleanTradeCmd.startsWith("dispute_") ||
        cleanTradeCmd.startsWith("cancel_")
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
        if (state.key === "AWAITING_WITHDRAW_PIN" || state.key === "AWAITING_VAULT_DEP_AMOUNT") {
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
            console.log(`[WA-AI] Parsing intent for text: "${lowerText}" (user=${senderPhone})`);
            const intent = await ai.parseIntent(lowerText);
            console.log(`[WA-AI] Intent: ${intent.intent} | Params: ${JSON.stringify(intent.params ?? {})}`);

            // Route known intents to handlers
            if (intent.intent === "CHECK_BALANCE" || intent.intent === "WALLET_BALANCE") {
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
                const typeFilter = intent.params?.type;
                const cmd = typeFilter === "sell" ? "/ads sell" : typeFilter === "buy" ? "/ads buy" : "/ads";
                await handleAdCommand(sock, msg, jid, user, cmd);
                return;
            }
            if (intent.intent === "VIEW_MY_ADS") {
                await handleAdCommand(sock, msg, jid, user, "/my_ads");
                return;
            }
            if (intent.intent === "VIEW_TRADES") {
                await handleTradeCommand(sock, msg, jid, user, "/trades");
                return;
            }
            // 🛡️ Safe Ad Creation: Route directly to step-by-step /post flow (no AI hallucinated rates or amounts)
            if (intent.intent === "CREATE_SELL_ORDER" || intent.intent === "CREATE_BUY_ORDER") {
                await handleAdCommand(sock, msg, jid, user, "/post");
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
                        { id: "https://p2pfather.com/webapp", url: "https://p2pfather.com/webapp", label: "🌐 Web Dashboard" },
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
        } catch (err: any) {
            console.error(`[WA-AI] AI intent parsing failed for "${lowerText}":`, err?.message || err);
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

    // Message 1 (Frame 1: Primary Wallet & Ad Creation Actions)
    await replyWithButtons(
        sock,
        jid,
        topMessageText,
        [
            { id: "/balance",      label: "💰 Wallet Balance" },
            { id: "vault_deposit", label: "🔒 Top Up Vault" },
            { id: "/post",         label: "➕ Create Ad" },
        ]
    );

    // Short 250ms gap so messages arrive stacked seamlessly
    await new Promise((r) => setTimeout(r, 250));

    // Message 2 (Frame 2: P2P Marketplace & Profile Actions)
    await replyWithButtons(
        sock,
        jid,
        `⚡ *P2P MARKETPLACE & PROFILE*`,
        [
            { id: "/ads",     label: "📊 Browse Ads" },
            { id: "https://p2pfather.com/webapp", url: "https://p2pfather.com/webapp", label: "🌐 Web Dashboard" },
            { id: "/profile", label: "👤 Profile" },
        ]
    );
}
