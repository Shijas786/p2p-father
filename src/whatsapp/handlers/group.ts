/**
 * WhatsApp Group Handler
 * - Responds to @bot mentions in WhatsApp groups
 * - Broadcasts new ads to all registered groups (with rate-limiting)
 * - Auto-deletes phishing links and WhatsApp group invite links
 */

import type { WASocket, IWebMessageInfo } from "../types";
import { db } from "../../db/client";
import { reply } from "../router";
import { fmtGroupLiveAds, fmtGroupAdBroadcast } from "../formatters";

// ─── Spam / Phishing Patterns ────────────────────────────────────────────────

// Match ANY URL or link sent in group (http, https, www, t.me, wa.me, chat.whatsapp.com, etc.)
const LINK_RE = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+|t\.me\/[^\s]+|wa\.me\/[^\s]+)/i;

// Phishing / scam keywords (extend as needed)
const PHISHING_PATTERNS: RegExp[] = [
    /free.*usdt/i,
    /earn.*usdt/i,
    /double.*your.*usdt/i,
    /investment.*profit/i,
    /guaranteed.*return/i,
    /send.*usdt.*get.*back/i,
    /click.*here.*to.*claim/i,
    /urgent.*transfer/i,
    /airdrop.*usdt/i,
    /scam\w*/i,
    /phish\w*/i,
];

/**
 * Scans every incoming group message for spam / phishing.
 * If the bot is group admin, deletes the message for everyone.
 * Always fires BEFORE the mention check so it runs on ALL messages.
 *
 * @returns true if the message was detected as spam and handled
 */
export async function scanAndDeleteSpam(
    sock: WASocket,
    msg: IWebMessageInfo,
    groupJid: string
): Promise<boolean> {
    const senderParticipant = msg.key?.participant ?? "unknown";
    const senderPhone = senderParticipant.split("@")[0];

    // ── 1. Image messages: always delete in groups (QR codes, payment screens, scam images) ──
    const isImage = Boolean(msg.message?.imageMessage);
    if (isImage) {
        console.log(`[GROUP-GUARD] Image message detected from ${senderParticipant} in ${groupJid}. Deleting (possible QR/scam image).`);
        await deleteOrWarn(sock, msg, groupJid, senderParticipant, senderPhone, "Images and QR codes");
        return true;
    }

    // ── 2. Text messages: scan for links or phishing patterns ──────────────────────
    const rawText = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ""
    );

    if (!rawText) return false;

    const hasLink = LINK_RE.test(rawText);
    const isPhishing = PHISHING_PATTERNS.some((re) => re.test(rawText));

    if (!hasLink && !isPhishing) return false;

    const reason = hasLink ? "External link" : "Phishing/spam content";
    console.log(`[GROUP-GUARD] Detected ${reason} in ${groupJid} from ${senderParticipant} (msgId=${msg.key?.id}). Attempting delete.`);
    await deleteOrWarn(
        sock, msg, groupJid, senderParticipant, senderPhone,
        hasLink ? "Links and URLs" : "Promotional / phishing text"
    );
    return true;
}

/** Shared helper: delete message for everyone (requires admin), fallback to public warning */
async function deleteOrWarn(
    sock: WASocket,
    msg: IWebMessageInfo,
    groupJid: string,
    senderParticipant: string,
    senderPhone: string,
    contentLabel: string
): Promise<void> {
    try {
        if (msg.key) {
            await sock.sendMessage(groupJid, { delete: msg.key } as any);
            console.log(`[GROUP-GUARD] ✅ Deleted message from ${senderParticipant} in ${groupJid}`);
        }
    } catch (deleteErr: any) {
        console.warn(`[GROUP-GUARD] ⚠️ Could not delete (bot not admin?): ${deleteErr?.message}`);
        try {
            await sock.sendMessage(
                groupJid,
                { text: `⚠️ @${senderPhone} — ${contentLabel} are not allowed in this group.` }
            );
        } catch (_) { /* silently ignore */ }
    }
}


// ─── Group Mention Handler ────────────────────────────────────────────────────

export async function handleGroupMention(
    sock: WASocket,
    msg: IWebMessageInfo,
    groupJid: string,
    text: string
): Promise<void> {
    // Register this group in our DB if not already
    await registerGroupIfNew(groupJid, sock);

    // Determine what the user wants
    const wantsBuy  = text.includes("buy");
    const wantsSell = text.includes("sell");
    const wantsRates  = text.includes("rate") || text.includes("price");
    const wantsHelp   = text.includes("help");

    if (wantsHelp) {
        await reply(
            sock,
            groupJid,
            `🤖 *P2PFather Bot — Group Commands*

• \`@bot ads\` or \`@bot live\` — Top 5 live P2P ads
• \`@bot sell\` — Best SELL rates (buy USDT)
• \`@bot buy\` — Active BUY ads (sell USDT)
• \`@bot rates\` — Current market rates
• \`@bot help\` — This menu

_Tap any trade link to open a private DM and start an instant escrow trade!_ 🔒`,
            msg
        );
        return;
    }

    if (wantsRates) {
        const sellOrders = await db.getActiveOrders("sell", "USDT", 3);
        const buyOrders  = await db.getActiveOrders("buy",  "USDT", 3);

        const bestSell = (sellOrders[0] as any)?.rate ?? "N/A";
        const bestBuy  = (buyOrders[0]  as any)?.rate ?? "N/A";

        await reply(
            sock,
            groupJid,
            `📈 *P2PFATHER MARKET RATES*

🟢 *Best SELL Rate:* ₹${bestSell} / USDT
🔴 *Best BUY Rate:*  ₹${bestBuy} / USDT

_Live orderbook:_ @bot ads`,
            msg
        );
        return;
    }

    // Default: show live ads
    const type: "buy" | "sell" | "all" = wantsBuy ? "buy" : wantsSell ? "sell" : "all";
    const orders = await db.getActiveOrders(wantsBuy ? "buy" : wantsSell ? "sell" : undefined, "USDT", 5);

    await reply(sock, groupJid, fmtGroupLiveAds(orders as any, type), msg);
}

// ─── Broadcast New Ad to All Groups ──────────────────────────────────────────

let broadcastSock: WASocket | null = null;

export function setBroadcastSock(sock: WASocket): void {
    broadcastSock = sock;
}

export async function broadcastNewAdToGroups(order: any): Promise<void> {
    if (!broadcastSock) return;

    let groups: any[];
    try {
        groups = await (db as any).getRegisteredBroadcastGroups();
    } catch {
        return; // No groups table yet, skip
    }

    if (!groups || groups.length === 0) return;

    const message = fmtGroupAdBroadcast(order);

    for (const group of groups) {
        try {
            await broadcastSock.sendMessage(group.group_jid, { text: message });
            // Rate-limit: 1.5 second delay between group messages to avoid spam flags
            await new Promise((r) => setTimeout(r, 1500));
        } catch (err) {
            console.error(`[WA] Broadcast failed for group ${group.group_jid}:`, err);
        }
    }
}

// ─── Group Registration ───────────────────────────────────────────────────────

async function registerGroupIfNew(groupJid: string, sock: WASocket): Promise<void> {
    try {
        const meta = await sock.groupMetadata(groupJid);
        await (db as any).registerBroadcastGroup(groupJid, meta.subject ?? "Unknown Group");
    } catch {
        // Ignore — groupMetadata may fail if bot not admin
    }
}

// ─── Group Welcome Templates (Telegram Parity) ────────────────────────────────
const WELCOME_TEMPLATES = [
    (name: string) => `Welcome ${name}! Make yourself at home in our P2P trading hub 🔥`,
    (name: string) => `Hey ${name}! Welcome to the family 🎩 Big trades ahead!`,
    (name: string) => `Welcome ${name}! Fast, escrow-protected P2P exchange starts here ⚡`,
    (name: string) => `Hey ${name}! Glad you joined us 🚀 Feel free to ask any questions!`,
    (name: string) => `Welcome to the squad, ${name}! 🤝 Fast escrow at your fingertips.`,
    (name: string) => `Welcome ${name}! 🎩 Glad to have another active trader in the group!`,
    (name: string) => `Hey ${name}! Welcome aboard 🌟 Happy trading!`,
];

// Deduplication cache: prevent double welcoming if user rejoins quickly (clear after 10 minutes)
const recentlyWelcomed = new Map<string, number>();

/**
 * Sends welcome message when a new participant joins a WhatsApp group.
 */
export async function handleGroupJoin(
    sock: WASocket,
    groupJid: string,
    participantJids: string[]
): Promise<void> {
    if (!participantJids || participantJids.length === 0) return;

    await registerGroupIfNew(groupJid, sock);

    const now = Date.now();
    for (const rawJid of participantJids) {
        const phone = rawJid.split("@")[0].split(":")[0];
        if (!phone) continue;

        const cacheKey = `${groupJid}_${phone}`;
        const lastWelcomed = recentlyWelcomed.get(cacheKey);
        if (lastWelcomed && now - lastWelcomed < 10 * 60 * 1000) {
            console.log(`[WA-Welcome] Skipping duplicate welcome for ${phone} in ${groupJid}`);
            continue;
        }

        recentlyWelcomed.set(cacheKey, now);

        const isLid = rawJid.includes("@lid") || phone.length > 12;
        const welcomeTag = isLid ? "trader" : `@${phone}`;
        const randomTemplate = WELCOME_TEMPLATES[Math.floor(Math.random() * WELCOME_TEMPLATES.length)];
        const welcomeText = randomTemplate(welcomeTag);

        try {
            await reply(sock, groupJid, welcomeText);
            console.log(`[WA-Welcome] ✅ Sent group welcome message to ${phone} in ${groupJid}`);
        } catch (err: any) {
            console.error(`[WA-Welcome] ❌ Failed to send welcome message to ${groupJid}:`, err?.message || err);
        }
    }
}

