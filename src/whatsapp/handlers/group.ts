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
import jsQR from "jsqr";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

/**
 * Scans image buffer locally for QR code using jsqr (0 AI cost).
 */
export function detectQrCodeInImageBuffer(buffer: Buffer): boolean {
    try {
        let width = 0;
        let height = 0;
        let data: Uint8ClampedArray | null = null;

        // Try JPEG decode
        if (buffer[0] === 0xff && buffer[1] === 0xd8) {
            const rawJpeg = jpeg.decode(buffer, { useTArray: true });
            width = rawJpeg.width;
            height = rawJpeg.height;
            data = new Uint8ClampedArray(rawJpeg.data);
        } else {
            // Try PNG decode
            const png = PNG.sync.read(buffer);
            width = png.width;
            height = png.height;
            data = new Uint8ClampedArray(png.data);
        }

        if (data && width > 0 && height > 0) {
            const code = jsQR(data, width, height);
            if (code) {
                console.log(`[QR-Scanner] Found QR code in image buffer (length=${code.data.length})`);
                return true;
            }
        }
    } catch (_) {
        // Not a valid JPEG/PNG or decode failed — skip local QR check
    }
    return false;
}

// ─── Spam / Phishing Patterns ────────────────────────────────────────────────

// Match forbidden links (external sites, Telegram channels, WhatsApp group invites).
// Allows wa.me/ phone number & P2PFather trade links.
const FORBIDDEN_LINK_RE = /(chat\.whatsapp\.com\/[^\s]+|t\.me\/[^\s]+|https?:\/\/(?!wa\.me\/)[^\s]+|www\.[^\s]+)/i;

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

    // Check if sender is a group admin (admins are exempt from image/link deletion)
    let isAdmin = false;
    try {
        const meta = await sock.groupMetadata(groupJid);
        const p = meta?.participants?.find(
            (item: any) => item.id === senderParticipant || item.id === `${senderPhone}@s.whatsapp.net`
        );
        isAdmin = Boolean(p?.admin);
    } catch (_) {}

    if (isAdmin) {
        return false; // Admins bypass guard scans
    }

    // ── 1. Image messages: 2-tier security scan (Local QR + AI Vision) ────────
    const isImage = Boolean(msg.message?.imageMessage);
    const imageBase64 = (msg as any).imageBase64 || (msg.message as any)?.imageBase64;

    if (isImage) {
        console.log(`[GROUP-GUARD] Image message detected from ${senderParticipant} in ${groupJid}. Running 2-tier scan...`);

        if (imageBase64) {
            const imageBuffer = Buffer.from(imageBase64, "base64");

            // Tier 1: Free Local QR Scanner ($0 AI cost)
            const hasQr = detectQrCodeInImageBuffer(imageBuffer);
            if (hasQr) {
                console.log(`[GROUP-GUARD] 🚨 QR Code detected in image from ${senderParticipant} in ${groupJid}. Deleting.`);
                await deleteOrWarn(sock, msg, groupJid, senderParticipant, senderPhone, "QR codes and payment request images");
                return true;
            }

            // Tier 2: AI Vision Scanner (Scam Banners & Fake Receipts)
            try {
                const { waAi } = await import("../../services/wa-ai");
                const aiResult = await waAi.analyzeGroupImage(imageBuffer);
                if (aiResult.isScam) {
                    console.log(`[GROUP-GUARD] 🚨 AI Vision flagged scam image (${aiResult.reason}) from ${senderParticipant} in ${groupJid}. Deleting.`);
                    await deleteOrWarn(sock, msg, groupJid, senderParticipant, senderPhone, `Suspicious images (${aiResult.reason})`);
                    return true;
                }
            } catch (aiErr: any) {
                console.warn("[GROUP-GUARD] AI Vision scan skipped/failed:", aiErr?.message);
            }

            console.log(`[GROUP-GUARD] ✅ Image from ${senderParticipant} passed both local QR and AI Vision scans.`);
            return false; // Image passed both local QR and AI Vision checks!
        }

        // If no image base64 buffer was received, delete for safety
        await deleteOrWarn(sock, msg, groupJid, senderParticipant, senderPhone, "Unverified images");
        return true;
    }

    // ── 2. Text messages: scan for links or phishing patterns ──────────────────────
    const rawText = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ""
    );

    if (!rawText) return false;

    const hasLink = FORBIDDEN_LINK_RE.test(rawText);
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
    (name: string) => `Hey ${name}, welcome to the family 🎩 Big trades ahead!`,
    (name: string) => `Welcome ${name}! Fast, escrow-protected P2P exchange starts here ⚡`,
    (name: string) => `Hey ${name}, glad you joined us 🚀 Feel free to ask any questions!`,
    (name: string) => `Welcome to the squad, ${name}! 🤝 Fast escrow at your fingertips.`,
    (name: string) => `Welcome ${name}! 🎩 Glad to have another active trader in the group!`,
    (name: string) => `Hey ${name}, welcome aboard 🌟 Happy trading!`,
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

