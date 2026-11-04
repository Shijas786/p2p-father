import { Context } from "grammy";
import { env } from "../config/env";
import { db } from "../db/client";
import { IpTrackerService } from "../services/ip-tracker";
import { escapeMarkdown } from "../utils/formatters";

// ─── Spam / Scammer Detection Patterns ────────────────────────────────────────

/**
 * Matches spam / mass-messaging / money-laundering / scammer display names or handles.
 * Detects Chinese proxy advertising tags, agent handles, and promotional arrows.
 * Example from live attack: "天赐代发👉@xxin7👈Direct🔺advertising for Mr.kaleef"
 */
export const TELEGRAM_SPAM_NAME_RE = /(?:代发|广告|引流|代收|承兑|客服|大宗|盘总|跑分|direct[🔺\s]*advertising|advertising\s+for|👉.*👈|👉@\w+)/i;

/**
 * Matches high-frequency crypto scams, notably the "From China unable to buy USDT above market price" scam.
 */
export const TELEGRAM_SCAM_TEXT_RE = /(?:(?:from\s+china|unable\s+to\s+purchase\s+usdt|policy\s+restrictions|buying\s+usdt|pay(?:ment)?\s+first.*send.*usdt).*?(?:5%|10%|20%|above.*market|@\w+|telegram:\s*@)|代发|代收|买u|出u|承兑|大宗|跑分|汇率.*点位|unable\s+to\s+purchase\s+usdt|buying\s+usdt\s+at\s+\d+%\s*-\s*\d+%\s+above)/i;

/**
 * Matches unauthorized off-platform deal solicitation / external contacts in group chatter.
 * E.g. "Telegram: @YLPAY858", "Contact me: @scammer", or external WhatsApp/Telegram invite links.
 */
export const TELEGRAM_FORBIDDEN_EXTERNAL_CONTACT_RE = /(?:(?:telegram|tg|dm|contact|chat|pm|reach)\s*(?:me)?\s*[:：\-]\s*@([a-zA-Z0-9_]{4,})|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+|t\.me\/(?:joinchat|\+[a-zA-Z0-9_-]+))/i;

// ─── Admin Cache (5-minute TTL per chat to prevent Telegram API rate limits) ──

const chatAdminCache = new Map<number, { adminIds: Set<number>; expiry: number }>();

/**
 * Checks whether a given user is an administrator of the Telegram chat or platform.
 */
export async function isChatAdmin(ctx: Context, userId: number): Promise<boolean> {
    if (!ctx.chat?.id || ctx.chat.type === "private") return false;

    // Platform superadmins
    if (env.ADMIN_IDS.includes(userId)) return true;

    const chatId = ctx.chat.id;
    const now = Date.now();
    const cached = chatAdminCache.get(chatId);
    if (cached && cached.expiry > now) {
        return cached.adminIds.has(userId);
    }

    try {
        const admins = await ctx.api.getChatAdministrators(chatId);
        const adminIds = new Set(admins.map((a) => a.user.id));
        chatAdminCache.set(chatId, { adminIds, expiry: now + 5 * 60 * 1000 });
        return adminIds.has(userId);
    } catch (e: any) {
        console.warn(`[GROUP-GUARD] Could not fetch chat administrators for ${chatId}:`, e?.message);
        return false;
    }
}

/**
 * Evaluates whether a group message or sender display name is spam/scam.
 */
export function isTelegramGroupSpam(
    text: string,
    senderFullName?: string,
    username?: string
): { isSpam: boolean; reason: string } {
    // 1. Spammer display name check
    if (senderFullName && TELEGRAM_SPAM_NAME_RE.test(senderFullName)) {
        return { isSpam: true, reason: `Spammer profile name pattern ("${senderFullName.trim()}")` };
    }
    if (username && TELEGRAM_SPAM_NAME_RE.test(username)) {
        return { isSpam: true, reason: `Spammer username pattern ("@${username}")` };
    }

    if (!text || text.trim().length === 0) {
        return { isSpam: false, reason: "" };
    }

    // 2. High-confidence scam text check (China USDT OTC scam, etc.)
    if (TELEGRAM_SCAM_TEXT_RE.test(text)) {
        return { isSpam: true, reason: "Chinese USDT OTC / Above-market price scam pattern" };
    }

    // 3. Unauthorized off-platform external contact solicitation
    const contactMatch = text.match(TELEGRAM_FORBIDDEN_EXTERNAL_CONTACT_RE);
    if (contactMatch) {
        const handle = contactMatch[1]?.toLowerCase();
        // Whitelist official platform handles
        const isOfficialHandle = handle === "p2pfather_bot" || handle === "p2pfather" || handle === "p2pkerala";
        if (!isOfficialHandle) {
            return { isSpam: true, reason: "Unauthorized external contact / off-platform deal solicitation" };
        }
    }

    return { isSpam: false, reason: "" };
}

/**
 * Handles detection of a scam message in a Telegram group:
 * 1. Deletes the message immediately.
 * 2. Bans the scammer and revokes all their past messages.
 * 3. Bans the user in database if present.
 * 4. Sends a brief self-deleting security alert.
 */
export async function handleGroupScamMessage(ctx: Context, reason: string): Promise<void> {
    if (!ctx.chat?.id || !ctx.from?.id) return;
    const chatId = ctx.chat.id;
    const sender = ctx.from;
    const senderName = sender.first_name || sender.username || `User ${sender.id}`;

    console.warn(`[GROUP-GUARD] 🚨 Purging scam message from ${sender.id} (@${sender.username || "no_handle"}) in chat ${chatId}. Reason: ${reason}`);

    // 1. Delete the scam message
    if (ctx.message?.message_id) {
        await ctx.api.deleteMessage(chatId, ctx.message.message_id).catch(() => {});
    }

    // 2. Ban the scammer and revoke all their messages in this group
    await ctx.api.banChatMember(chatId, sender.id, { revoke_messages: true }).catch((err) => {
        console.error(`[GROUP-GUARD] ⚠️ Could not ban scammer ${sender.id}:`, err?.message);
    });

    // 3. Mark banned in DB
    try {
        const dbUser = await db.getUserByTelegramId(sender.id);
        if (dbUser?.id) {
            await IpTrackerService.banUser(dbUser.id);
        }
    } catch (_) {}

    // 4. Send self-destructing group alert (auto-deleted after 10s)
    try {
        const alertMsg = await ctx.reply(
            `🛡️ *Group Security Notice*\n\nRemoved scam message and banned [${escapeMarkdown(senderName)}](tg://user?id=${sender.id}) for advertising prohibited scams/services.`,
            { parse_mode: "Markdown" }
        );
        if (alertMsg?.message_id) {
            setTimeout(() => {
                ctx.api.deleteMessage(chatId, alertMsg.message_id).catch(() => {});
            }, 10000);
        }
    } catch (_) {}
}

/**
 * Handles an unauthorized bot being added to the group:
 * 1. Bans the bot immediately.
 * 2. Deletes the join service message.
 * 3. If added by a non-admin, bans the inviter as well!
 */
export async function handleUnauthorizedBotJoin(
    ctx: Context,
    botMember: { id: number; username?: string; first_name?: string },
    inviter?: { id: number; username?: string; first_name?: string }
): Promise<void> {
    if (!ctx.chat?.id) return;
    const chatId = ctx.chat.id;

    console.warn(`[GROUP-GUARD] 🚨 Unauthorized bot ${botMember.id} (@${botMember.username}) added to chat ${chatId} by ${inviter?.id || "unknown"}`);

    // 1. Ban the bot
    await ctx.api.banChatMember(chatId, botMember.id, { revoke_messages: true }).catch(() => {});

    // 2. Delete join service message
    await ctx.deleteMessage().catch(() => {});

    // 3. Check inviter: If added by a non-admin user, ban the inviter too
    if (inviter && inviter.id !== botMember.id) {
        const isInviterAdmin = await isChatAdmin(ctx, inviter.id);
        if (!isInviterAdmin) {
            console.warn(`[GROUP-GUARD] 🚨 Banning inviter ${inviter.id} (@${inviter.username}) for adding unauthorized bot.`);
            await ctx.api.banChatMember(chatId, inviter.id, { revoke_messages: true }).catch(() => {});
        }
    }

    // 4. Self-deleting warning notice
    try {
        const alert = await ctx.reply(
            `🛡️ *Group Security Notice*\n\nUnauthorized bot @${botMember.username || botMember.first_name || botMember.id} was banned and removed.`,
            { parse_mode: "Markdown" }
        );
        if (alert?.message_id) {
            setTimeout(() => {
                ctx.api.deleteMessage(chatId, alert.message_id).catch(() => {});
            }, 10000);
        }
    } catch (_) {}
}
