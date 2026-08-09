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

// WhatsApp group invite links
const WA_GROUP_INVITE_RE = /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i;

// Common phishing / scam domains and patterns (extend as needed)
const PHISHING_PATTERNS: RegExp[] = [
    /bit\.ly\/[A-Za-z0-9]+/i,        // URL shorteners
    /t\.me\/\+[A-Za-z0-9]+/i,        // Telegram group invite links in WA groups
    /tinyurl\.com/i,
    /free.*usdt/i,
    /earn.*usdt.*daily/i,
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
        const caption = msg.message?.imageMessage?.caption ?? "";
        console.log(`[GROUP-GUARD] Image message detected from ${senderParticipant} in ${groupJid}. Deleting (possible QR/scam image).`);
        await deleteOrWarn(sock, msg, groupJid, senderParticipant, senderPhone, "Images and QR codes");
        return true;
    }

    // ── 2. Text messages: scan for phishing/spam patterns ──────────────────────
    const rawText = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ""
    );

    if (!rawText) return false;

    const isWaInvite = WA_GROUP_INVITE_RE.test(rawText);
    const isPhishing = PHISHING_PATTERNS.some((re) => re.test(rawText));

    if (!isWaInvite && !isPhishing) return false;

    const reason = isWaInvite ? "WhatsApp group invite link" : "phishing/spam content";
    console.log(`[GROUP-GUARD] Detected ${reason} in ${groupJid} from ${senderParticipant}. Attempting delete.`);
    await deleteOrWarn(
        sock, msg, groupJid, senderParticipant, senderPhone,
        isWaInvite ? "WhatsApp group invite links" : "Promotional / phishing links"
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
