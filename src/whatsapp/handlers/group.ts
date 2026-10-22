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
import { env } from "../../config/env";
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
    const senderRaw = senderParticipant.split("@")[0] || "";
    const senderPhone = senderRaw.split(":")[0];

    // 1. Direct admin flag passed from bridge/webhook
    let isAdmin = Boolean((msg.key as any)?.isAdmin);

    // 2. Platform admin whitelist check
    if (!isAdmin && senderPhone) {
        try {
            const user = await db.getUserByWhatsappPhone(senderPhone);
            if (user && env.ADMIN_IDS.includes(Number(user.telegram_id))) {
                isAdmin = true;
            }
        } catch (_) {}
    }

    // 3. WhatsApp group metadata check (matches standard JID, device JID, or LID)
    if (!isAdmin) {
        try {
            const meta = await sock.groupMetadata(groupJid);
            if (meta?.participants && Array.isArray(meta.participants)) {
                const p = meta.participants.find((item: any) => {
                    const itemId = item.id || item.jid || "";
                    const itemRaw = itemId.split("@")[0] || "";
                    const itemPhone = itemRaw.split(":")[0];
                    const itemLid = (item.lid || "").split("@")[0].split(":")[0];

                    return (
                        itemId === senderParticipant ||
                        itemPhone === senderPhone ||
                        (itemLid && itemLid === senderPhone)
                    );
                });
                isAdmin = Boolean(p?.admin || p?.isAdmin || p?.isSuperAdmin);
            }
        } catch (_) {}
    }

    if (isAdmin) {
        console.log(`[GROUP-GUARD] 👑 Sender ${senderPhone} is group admin in ${groupJid} — skipping spam check.`);
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

    // ── 2. Text messages: scan ONLY for forbidden links ─────────────────────────
    const rawText = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ""
    );

    if (!rawText) return false;

    const hasLink = FORBIDDEN_LINK_RE.test(rawText);
    if (!hasLink) return false;

    console.log(`[GROUP-GUARD] Detected external link in ${groupJid} from ${senderParticipant} (msgId=${msg.key?.id}). Attempting delete.`);
    await deleteOrWarn(
        sock, msg, groupJid, senderParticipant, senderPhone,
        "Links and URLs"
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

/**
 * Verifies if the bot number is an admin (or superadmin) in the specified group.
 * Ensures WA ad posts ONLY go to groups where the bot is an admin.
 */
export async function isBotAdminInGroup(groupJid: string, sock: WASocket): Promise<boolean> {
    try {
        const meta = await sock.groupMetadata(groupJid);
        if (!meta?.participants || !Array.isArray(meta.participants)) {
            console.warn(`[WA-AdminCheck] Could not fetch participants for group ${groupJid}`);
            return false;
        }

        const botPhone = (
            env.WA_BOT_NUMBER ||
            process.env.WA_BOT_NUMBER ||
            sock.user?.id?.split("@")[0]?.split(":")[0] ||
            "917012751478"
        ).replace(/[^0-9]/g, "");

        const sockUserPhone = sock.user?.id?.split("@")[0]?.split(":")[0]?.replace(/[^0-9]/g, "");

        const botParticipant = meta.participants.find((p: any) => {
            const pId = p.id || p.jid || "";
            const pPhone = pId.split("@")[0]?.split(":")[0]?.replace(/[^0-9]/g, "");
            const pLid = (p.lid || "").split("@")[0]?.split(":")[0]?.replace(/[^0-9]/g, "");

            return (
                pId === sock.user?.id ||
                (botPhone && pPhone === botPhone) ||
                (sockUserPhone && pPhone === sockUserPhone) ||
                (botPhone && pLid === botPhone) ||
                pId.includes("107533851197688") ||
                pLid === "107533851197688" ||
                pPhone === "107533851197688"
            );
        });

        if (!botParticipant) {
            console.log(`[WA-AdminCheck] Bot (${botPhone}) is not in participant list for group ${groupJid}`);
            return false;
        }

        const isAdmin = Boolean(
            botParticipant.admin === "admin" ||
            botParticipant.admin === "superadmin" ||
            botParticipant.isAdmin ||
            botParticipant.isSuperAdmin
        );

        console.log(`[WA-AdminCheck] Group ${groupJid} -> Bot (${botPhone}) isAdmin=${isAdmin}`);
        return isAdmin;
    } catch (err: any) {
        console.warn(`[WA-AdminCheck] Failed to verify admin status for ${groupJid}:`, err?.message || err);
        return false;
    }
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
            // 🛡️ CRITICAL REQUIREMENT: Make sure WA ad post ONLY to group where bot number is admin
            const isAdmin = await isBotAdminInGroup(group.group_jid, broadcastSock);
            if (!isAdmin) {
                console.log(`[WA-Broadcast] ⏭️ Skipping group ${group.group_jid} (${group.group_name}) — bot is NOT an admin.`);
                await (db as any).setBroadcastGroupActive(group.group_jid, false).catch(() => {});
                continue;
            }

            await broadcastSock.sendMessage(group.group_jid, { text: message });
            // Rate-limit: 1.5 second delay between group messages to avoid spam flags
            await new Promise((r) => setTimeout(r, 1500));
        } catch (err) {
            console.error(`[WA] Broadcast failed for group ${group.group_jid}:`, err);
        }
    }
}

export async function broadcastTelegramSellAdLinkToWhatsAppGroups(url: string): Promise<void> {
    if (!broadcastSock || !url) return;

    let groups: any[];
    try {
        groups = await (db as any).getRegisteredBroadcastGroups();
    } catch {
        return;
    }

    if (!groups || groups.length === 0) return;

    for (const group of groups) {
        try {
            // 🛡️ CRITICAL REQUIREMENT: Make sure WA ad post ONLY to group where bot number is admin
            const isAdmin = await isBotAdminInGroup(group.group_jid, broadcastSock);
            if (!isAdmin) {
                console.log(`[WA-Broadcast] ⏭️ Skipping group ${group.group_jid} (${group.group_name}) — bot is NOT an admin.`);
                await (db as any).setBroadcastGroupActive(group.group_jid, false).catch(() => {});
                continue;
            }

            await broadcastSock.sendMessage(group.group_jid, { text: url });
            // Rate-limit: 1.5 second delay between group messages to avoid spam flags
            await new Promise((r) => setTimeout(r, 1500));
        } catch (err) {
            console.error(`[WA] Failed broadcasting TG sell ad link to group ${group.group_jid}:`, err);
        }
    }
}

// ─── Group Registration ───────────────────────────────────────────────────────

export async function registerGroupIfNew(groupJid: string, sock: WASocket): Promise<void> {
    try {
        // 🛡️ Only register groups where the bot number is an admin
        const isAdmin = await isBotAdminInGroup(groupJid, sock);
        if (!isAdmin) {
            console.log(`[WA-Group] ℹ️ Bot is NOT admin in group ${groupJid} — skipping broadcast registration.`);
            return;
        }

        const meta = await sock.groupMetadata(groupJid);
        await (db as any).registerBroadcastGroup(groupJid, meta?.subject ?? "Unknown Group");
        console.log(`[WA-Group] ✅ Registered broadcast group ${groupJid} (${meta?.subject ?? "Unknown Group"}) where bot is admin.`);
    } catch (err: any) {
        // Ignore — groupMetadata may fail if bot not admin or left
        console.warn(`[WA-Group] Error in registerGroupIfNew for ${groupJid}:`, err?.message || err);
    }
}

// ─── Group Welcome Templates (Short, punchy & human) ──────────────────────────
export const WELCOME_TEMPLATES = [
    (tag: string) => tag ? `Welcome ${tag}! 🤝` : `Welcome! 🤝`,
    (tag: string) => tag ? `Hey ${tag}, welcome to P2P Father 🎩` : `Welcome to P2P Father 🎩`,
    (tag: string) => tag ? `Welcome ${tag} 👋` : `Welcome to the group 👋`,
    (tag: string) => tag ? `Yo ${tag}, welcome! 🔥` : `Yo, welcome to the group! 🔥`,
    (tag: string) => tag ? `Hey ${tag}, welcome aboard ⚡` : `Welcome aboard ⚡`,
    (tag: string) => tag ? `Welcome to the group ${tag} 🚀` : `Welcome to the group! 🚀`,
];

// Deduplication cache: prevent double welcoming if user rejoins quickly (clear after 10 minutes)
const recentlyWelcomed = new Map<string, number>();

/**
 * Checks if the given group JID is the official community group.
 */
export function isOfficialWhatsAppGroup(groupJid: string): boolean {
    const rawConfig = env.WA_OFFICIAL_GROUP_JID || (process.env as any).WA_OFFICIAL_GROUP_JID || "120363410362268845@g.us";
    const officialGroupJids = rawConfig
        .split(",")
        .map((j: string) => j.trim().toLowerCase())
        .filter(Boolean);

    const normalizedGroupJid = (groupJid || "").toLowerCase();
    return officialGroupJids.some(
        (official: string) =>
            normalizedGroupJid === official ||
            normalizedGroupJid.startsWith(official.split("@")[0]) ||
            official.startsWith(normalizedGroupJid.split("@")[0])
    );
}

/**
 * Sends welcome message when a new participant joins a WhatsApp group.
 * NOTE: Welcome messages are restricted STRICTLY to the official main group.
 */
export async function handleGroupJoin(
    sock: WASocket,
    groupJid: string,
    participantJids: string[]
): Promise<void> {
    if (!participantJids || participantJids.length === 0) return;

    await registerGroupIfNew(groupJid, sock);

    // 🛡️ Restrict welcome messages strictly to the official main community group
    if (!isOfficialWhatsAppGroup(groupJid)) {
        console.log(`[WA-Welcome] ⏭️ Skipping welcome: ${groupJid} is not the official main group.`);
        return;
    }

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
        const welcomeTag = isLid ? "" : `@${phone}`;
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

