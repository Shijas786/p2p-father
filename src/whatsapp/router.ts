/**
 * P2PFather WhatsApp Message Router
 */

import type { WASocket, proto, WAMessage } from "@whiskeysockets/baileys";
import { db } from "../db/client";
import { handleWalletCommand } from "./handlers/wallet";
import { handleAdCommand } from "./handlers/ads";
import { handleTradeCommand } from "./handlers/trade";
import { handleGroupMention } from "./handlers/group";
import { MAIN_MENU } from "./formatters";
import { ai } from "../services/ai";
import { env } from "../config/env";

function extractText(msg: proto.IWebMessageInfo): string {
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
    quoted?: proto.IWebMessageInfo
): Promise<void> {
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
    let formattedText = text;
    if (buttons && buttons.length > 0) {
        const optionLines = buttons.map((b, i) => {
            const cmd = b.id.startsWith("/") ? b.id : "`" + b.id + "`";
            return `${i + 1}️⃣ *${b.label}* → reply \`${i + 1}\` or tap ${cmd}`;
        });
        formattedText += `\n\n👇 *Quick Options:*\n${optionLines.join("\n")}`;
    }

    try {
        await sock.sendMessage(jid, {
            text: formattedText,
            footer,
            buttons: buttons.map((b) => ({
                buttonId: b.id,
                buttonText: { displayText: b.label },
                type: 1,
            })),
            headerType: 1,
        } as any);
    } catch {
        await sock.sendMessage(jid, { text: formattedText });
    }
}

// ── Step 1: Welcome Screen (first message to new WA users) ───────────────────
async function showWelcomeScreen(
    sock: WASocket,
    jid: string,
    msg: proto.IWebMessageInfo
): Promise<void> {
    await replyWithButtons(
        sock,
        jid,
        `👋 *Welcome to P2PFather!* 🇮🇳

P2PFather is a *safe, fast, and trusted crypto P2P exchange* built for the Indian market.

💱 *Buy & Sell USDT* peer-to-peer with UPI, IMPS, and bank transfers
🔒 *Smart Contract Escrow* — your funds are always protected
⚡ *Instant Matching* — trade with verified traders in seconds
🌐 *Multi-Chain* — BSC, Polygon, and Base supported
📊 *Live Orderbook* — real-time buy/sell ads from verified traders

_No middlemen. No hidden fees. Just safe P2P crypto trading._

To get started, create your wallet or learn how it works 👇`,
        [
            { id: "wa_guide",         label: "📖 How It Works" },
            { id: "wa_create_wallet", label: "💳 Create Wallet" },
        ]
    );
}

// ── Step 2: Platform Guide ────────────────────────────────────────────────────
async function showGuide(
    sock: WASocket,
    jid: string,
    msg: proto.IWebMessageInfo
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

🔒 *Your funds are NEVER held by us — only by the smart contract.*

Ready to start? Create your wallet below 👇`,
        [
            { id: "wa_create_wallet", label: "💳 Create Wallet" },
        ]
    );
}

// ── Step 3: Wallet Type Choice ────────────────────────────────────────────────
async function showWalletChoice(
    sock: WASocket,
    jid: string,
    msg: proto.IWebMessageInfo
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
            { id: "wa_setup_link_telegram", label: "🔗 Link Telegram Account" },
            { id: "wa_setup_newwallet",     label: "✨ New Wallet" },
        ]
    );
}

export async function routeMessage(
    sock: WASocket,
    msg: proto.IWebMessageInfo
): Promise<void> {
    if (!msg.key) return;
    const jid = msg.key.remoteJid;
    if (!jid) return;

    const text = extractText(msg).toLowerCase();
    const isGroup = jid.endsWith("@g.us");
    const senderJid = (isGroup ? msg.key.participant : jid) ?? "";
    const senderPhone = senderJid.split("@")[0];

    // ── Group: only respond if @mentioned ────────────────────────────────────
    if (isGroup) {
        const botJid = getBotJid(sock);
        const mentionedJids: string[] =
            (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid as string[]) ?? [];
        const isMentioned =
            mentionedJids.includes(botJid) ||
            text.includes("@bot") ||
            text.startsWith("!p2p") ||
            text.startsWith("!ads");

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

    if (text === "/start" || text === "hi" || text === "hello" || text === "menu" || text === "") {
        await (db as any).clearWhatsappState(user.id);
        // New user with no wallet yet — show welcome screen
        if (!user.wallet_address) {
            await showWelcomeScreen(sock, jid, msg);
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
        const botUsername = process.env.TELEGRAM_BOT_USERNAME || "P2PFatherBot";
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
            await reply(sock, jid, "⏳ Creating your wallet...", msg);
            const updatedUser = await (db as any).assignWalletToWaUser(user.id);
            // Update local user object
            user = updatedUser;
            await replyWithButtons(
                sock,
                jid,
                `✅ *WALLET CREATED!*

Your P2PFather wallet is ready 🎉

• *Address:* \`${updatedUser.wallet_address?.slice(0, 10)}...${updatedUser.wallet_address?.slice(-4)}\`
• Supports USDT on BSC, Polygon, Base

You can now deposit, trade, and withdraw.`,
                [
                    { id: "/deposit", label: "📥 Deposit USDT" },
                    { id: "/ads",     label: "📊 Browse P2P Ads" },
                ]
            );
        } catch (err: any) {
            await reply(sock, jid, "❌ Failed to create wallet. Please try again or contact support.", msg);
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
        /\b(balance|wallet|funds|my usdt|check balance|how much usdt|kithaanu|enthaanu balance|balance aano|bakki undu)\b/.test(lowerText)
    ) {
        await handleWalletCommand(sock, msg, jid, senderPhone, user, text.includes("/deposit") ? "/deposit" : text.includes("/send") ? "/send" : text.includes("/withdraw") ? "/withdraw" : "/balance");
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
        text.startsWith("/delete_ad_") ||
        text.startsWith("/pause_ad_") ||
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
                await reply(sock, jid, MAIN_MENU, msg);
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
