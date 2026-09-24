import { Bot, Context, session, InlineKeyboard, InputFile } from "grammy";
import path from "path";
import fs from "fs";
import { env } from "../config/env";
import { db } from "../db/client";
import { ai } from "../services/ai";
import { escrow } from "../services/escrow";
import { bridge } from "../services/bridge";
import { wallet } from "../services/wallet";
import { market } from "../services/market";
import { feeCashbackService } from "../services/feeCashbackService";
import { groupManager } from "../utils/groupManager";
import { IpTrackerService } from "../services/ip-tracker";
import { getQualifyingVIPConfig } from "../config/feeCashback";
import {
    formatOrder,
    formatINR,
    formatTokenAmount,
    formatTradeStatus,
    formatTimeRemaining,
    truncateAddress,
    formatShortDate,
    escapeMarkdown,
    escapeHTML,
} from "../utils/formatters";
import type { SessionData, User } from "../types";

// ═══════════════════════════════════════════════════════════════
//                      BOT SETUP
// ═══════════════════════════════════════════════════════════════

type BotContext = Context & { session: SessionData };

const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);

// Initialize Logger
import { logger } from "../utils/logger";
logger.init(bot);

// GLOBAL DEBUG LOGGER
bot.use(async (ctx, next) => {
    // Log only if it's a message to avoid spamming other updates like poll answers/etc if not needed
    if (ctx.message || ctx.channelPost) {
        logger.info("DEBUG", `Update received: ${JSON.stringify(ctx.update, null, 2)}`);
    }
    await next();
});

// Session middleware
bot.use(
    session({
        initial: (): SessionData => ({
            conversation_history: [],
        }),
    })
);


// ═══════════════════════════════════════════════════════════════
//                    HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function getExplorerUrl(txHash: string, chain: 'base' | 'bsc' = 'base'): string {
    const baseUrl = chain === 'base' ? "https://basescan.org" : "https://bscscan.com";
    return `${baseUrl}/tx/${txHash}`;
}

async function safeEditMessage(ctx: BotContext, text: string, extra: any = {}) {
    try {
        await ctx.editMessageText(text, extra);
    } catch (err: any) {
        const msg = err.message || "";
        if (msg.includes("deactivated") || msg.includes("blocked") || msg.includes("kicked")) {
            console.warn(`[Bot] safeEditMessage: User deactivated/blocked (${msg})`);
            return;
        }
        if (msg.includes("there is no text in the message to edit")) {
            try {
                await ctx.editMessageCaption({ caption: text, parse_mode: extra?.parse_mode, reply_markup: extra?.reply_markup });
                return;
            } catch (_) { }
        }
        // Fallback to regular reply if edit fails for other reasons (e.g. message is photo or not modified)
        await ctx.reply(text, extra).catch(() => { });
    }
}

let cachedBotInfo: any = null;
async function getBotInfo() {
    if (!cachedBotInfo) {
        cachedBotInfo = await bot.api.getMe();
    }
    return cachedBotInfo;
}

async function broadcast(message: string, keyboard?: InlineKeyboard, parseMode: "Markdown" | "HTML" | "MarkdownV2" = "Markdown"): Promise<{ chatId: number; messageId: number }[]> {
    const rawGroups = await groupManager.getGroups();
    const groups = rawGroups.filter(id => typeof id === "number" && id < 0);

    // Include ENV broadcast channel if set and strictly negative
    if (env.BROADCAST_CHANNEL_ID) {
        const adminChannel = Number(env.BROADCAST_CHANNEL_ID);
        if (!isNaN(adminChannel) && adminChannel < 0 && !groups.includes(adminChannel)) {
            groups.push(adminChannel);
        }
    }

    if (groups.length === 0) return [];

    console.log(`📡 Broadcasting to ${groups.length} groups...`);

    const results: { chatId: number; messageId: number }[] = [];

    for (const chatId of groups) {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                const msg = await bot.api.sendMessage(chatId, message, { parse_mode: parseMode, reply_markup: keyboard });
                results.push({ chatId, messageId: msg.message_id });
                break; // Success, proceed to next group
            } catch (error: any) {
                // If group or Telegram rejects custom emojis, strip tags and send with standard unicode emojis
                if (error.description?.includes("custom emoji") || error.description?.includes("CUSTOM_EMOJI")) {
                    try {
                        const strippedMsg = stripTgCustomEmojis(message);
                        const fallbackMsg = await bot.api.sendMessage(chatId, strippedMsg, { parse_mode: parseMode, reply_markup: keyboard });
                        results.push({ chatId, messageId: fallbackMsg.message_id });
                        break;
                    } catch (fbErr) {
                        // ignore and fall through to standard error handling
                    }
                }
                attempts++;
                const isPermanent = error.description?.includes("kicked") ||
                    error.description?.includes("blocked") ||
                    error.description?.includes("not a member") ||
                    error.description?.includes("chat not found");

                if (isPermanent) {
                    console.log(`❌ Removing invalid group ${chatId}`);
                    groupManager.removeGroup(chatId).catch(console.error);
                    break;
                }

                if (attempts >= maxAttempts) {
                    console.error(`⚠️ Broadcast FAILED to ${chatId} after ${maxAttempts} attempts:`, error.message);
                    break;
                }

                const retryAfterSec = error.parameters?.retry_after;
                if (retryAfterSec && retryAfterSec > 0) {
                    if (retryAfterSec > 15) {
                        console.error(`⚠️ Telegram rate-limited ${chatId} (retry_after=${retryAfterSec}s). Aborting attempt.`);
                        break;
                    }
                    await new Promise(r => setTimeout(r, (retryAfterSec + 1) * 1000));
                } else {
                    const delay = 1000 * attempts;
                    console.log(`🔄 Retrying broadcast to ${chatId} (Attempt ${attempts + 1}/${maxAttempts}) in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        // Small delay between groups to avoid burst limits
        await new Promise(r => setTimeout(r, 300));
    }

    return results;
}

async function broadcastAnimation(animationSource: string | InputFile | (() => InputFile), caption: string, keyboard?: InlineKeyboard, parseMode: "Markdown" | "HTML" | "MarkdownV2" = "Markdown"): Promise<{ chatId: number; messageId: number }[]> {
    const rawGroups = await groupManager.getGroups();
    const groups = rawGroups.filter(id => typeof id === "number" && id < 0);

    if (env.BROADCAST_CHANNEL_ID) {
        const adminChannel = Number(env.BROADCAST_CHANNEL_ID);
        if (!isNaN(adminChannel) && adminChannel < 0 && !groups.includes(adminChannel)) {
            groups.push(adminChannel);
        }
    }

    if (groups.length === 0) return [];

    console.log(`📡 Broadcasting animation to ${groups.length} groups...`);

    const results: { chatId: number; messageId: number }[] = [];

    for (const chatId of groups) {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                // If animationSource is a factory function, create a fresh InputFile per group to avoid exhausted streams
                const anim = typeof animationSource === "function" ? animationSource() : animationSource;
                const msg = await bot.api.sendAnimation(chatId, anim, { caption, parse_mode: parseMode, reply_markup: keyboard });
                results.push({ chatId, messageId: msg.message_id });
                break; // Success
            } catch (error: any) {
                // If custom emoji is rejected, strip to plain emojis and send fallback
                if (error.description?.includes("custom emoji") || error.description?.includes("CUSTOM_EMOJI")) {
                    try {
                        const fallbackAnim = typeof animationSource === "function" ? animationSource() : animationSource;
                        const msg = await bot.api.sendAnimation(chatId, fallbackAnim, { caption: stripTgCustomEmojis(caption), parse_mode: parseMode, reply_markup: keyboard });
                        results.push({ chatId, messageId: msg.message_id });
                        break;
                    } catch (fbErr) {
                        // ignore and fall through to standard error handling
                    }
                }
                attempts++;
                const isPermanent = error.description?.includes("kicked") ||
                    error.description?.includes("blocked") ||
                    error.description?.includes("not a member") ||
                    error.description?.includes("chat not found");

                if (isPermanent) {
                    console.log(`❌ Removing invalid group ${chatId}`);
                    groupManager.removeGroup(chatId).catch(console.error);
                    break;
                }

                if (attempts >= maxAttempts) {
                    console.error(`⚠️ Broadcast animation FAILED to ${chatId} after ${maxAttempts} attempts:`, error.message);
                    break;
                }

                const retryAfterSec = error.parameters?.retry_after;
                if (retryAfterSec && retryAfterSec > 0) {
                    if (retryAfterSec > 15) {
                        console.error(`⚠️ Telegram rate-limited animation to ${chatId} (retry_after=${retryAfterSec}s). Aborting attempt.`);
                        break;
                    }
                    await new Promise(r => setTimeout(r, (retryAfterSec + 1) * 1000));
                } else {
                    const delay = 1000 * attempts;
                    console.log(`🔄 Retrying broadcast animation to ${chatId} (Attempt ${attempts + 1}/${maxAttempts}) in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        // Pace media uploads between groups
        await new Promise(r => setTimeout(r, 500));
    }

    return results;
}

let availableGifs: string[] = [];

// ─── Custom Telegram Emojis for Broadcasts ────────────────────────────────────
import {
    TG_CUSTOM_EMOJIS,
    stripTgCustomEmojis,
    tgCustomEmoji,
    getRandomCelebrationEmoji,
    getRandomKycEmoji,
    getTokenCustomEmoji,
    getChainCustomEmoji,
    getTraderBadges,
} from "../utils/telegramEmojis";

export {
    TG_CUSTOM_EMOJIS,
    stripTgCustomEmojis,
    tgCustomEmoji,
    getRandomCelebrationEmoji,
    getRandomKycEmoji,
    getTokenCustomEmoji,
    getChainCustomEmoji,
    getTraderBadges,
};

function formatTraderDisplay(username?: string | null, firstName?: string | null, hideHandle: any = false): string {
    if (Boolean(hideHandle)) {
        return "****";
    }
    if (username) return `@${escapeHTML(username)}`;
    if (firstName) return escapeHTML(firstName);
    return "Trader";
}

export async function broadcastTradeSuccess(trade: any, order: any) {
    try {
        // ✨ Liveness Feedback - A small delay gives a "live processing" feel for completions
        await new Promise(r => setTimeout(r, 1200));

        // Always fetch fresh real-time privacy settings from DB
        let sellerHide = Boolean(trade.seller_hide_handle);
        let buyerHide = Boolean(trade.buyer_hide_handle);
        let sellerBadges = "";
        let buyerBadges = "";

        if (trade.seller_id) {
            const s = await db.getUserById(trade.seller_id);
            if (s) {
                sellerHide = Boolean(s.hide_group_handle);
                sellerBadges = getTraderBadges(s);
            }
        }
        if (trade.buyer_id) {
            const b = await db.getUserById(trade.buyer_id);
            if (b) {
                buyerHide = Boolean(b.hide_group_handle);
                buyerBadges = getTraderBadges(b);
            }
        }

        const buyer = formatTraderDisplay(trade.buyer_username, trade.buyer_first_name || "Buyer", buyerHide) + buyerBadges;
        const seller = formatTraderDisplay(trade.seller_username, trade.seller_first_name || "Seller", sellerHide) + sellerBadges;
        const totalFiat = (trade.amount * trade.rate).toLocaleString(undefined, { maximumFractionDigits: 0 });
        const chain = (trade.chain || order?.chain || 'bsc').toLowerCase();
        const token = (trade.token || order?.token || "USDC").toUpperCase();

        const tokenEmoji = getTokenCustomEmoji(token);
        const tokenDisplay = tokenEmoji ? `${tokenEmoji} ${escapeHTML(token)}` : escapeHTML(token);
        const formattedAmt = formatTokenAmount(trade.amount, trade.token);
        const amtStr = formattedAmt.replace(token, tokenDisplay);

        // Build tx link with Etherscan logo
        let txLine = "✅ Escrowed & settled on-chain";
        if (trade.release_tx_hash && !trade.release_tx_hash.startsWith('relayed')) {
            const explorer = chain === 'bsc' ? 'https://bscscan.com/tx/' : 'https://basescan.org/tx/';
            const explorerName = chain === 'bsc' ? 'BscScan' : 'BaseScan';
            const scanEmoji = tgCustomEmoji(TG_CUSTOM_EMOJIS.SCAN, "🔗");
            txLine = `${scanEmoji} <a href="${escapeHTML(explorer)}${escapeHTML(trade.release_tx_hash)}">View Transaction on ${explorerName}</a>`;
        }

        const celebrationEmoji = getRandomCelebrationEmoji();
        const msg = [
            `${celebrationEmoji} <b>Trade Completed!</b>`,
            "",
            `${seller} sold <b>${amtStr}</b> to ${buyer}`,
            `💰 Deal: ₹${escapeHTML(totalFiat)}`,
            `🔗 Chain: ${getChainCustomEmoji(chain)} <b>${escapeHTML(chain.toUpperCase())}</b>`,
            "",
            txLine,
            "⚡ Trade safe with P2PFather → /start",
        ].join("\n");

        // Try to send with a random GIF without repeating until all are shown
        const gifDir = path.join(process.cwd(), "assets", "trade complte gif collection");
        let randomGifPath = "";
        try {
            if (fs.existsSync(gifDir)) {
                if (availableGifs.length === 0) {
                    const files = fs.readdirSync(gifDir);
                    availableGifs = files.filter(f => f.toLowerCase().endsWith('.gif'));
                    // Shuffle array
                    for (let i = availableGifs.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [availableGifs[i], availableGifs[j]] = [availableGifs[j], availableGifs[i]];
                    }
                }

                while (availableGifs.length > 0) {
                    const randomFile = availableGifs.pop()!;
                    const candidatePath = path.join(gifDir, randomFile);
                    if (fs.existsSync(candidatePath)) {
                        randomGifPath = candidatePath;
                        break;
                    }
                }
            }
        } catch (err) {
            console.error("Could not read gif collection:", err);
        }

        if (randomGifPath) {
            await broadcastAnimation(() => new InputFile(randomGifPath), msg, undefined, "HTML");
        } else {
            await broadcast(msg, undefined, "HTML");
        }
    } catch (e) {
        console.error("BroadcastSuccess error:", e);
    }
}

export function buildAdMessageText(order: any, user: any, statusOverride?: string): string {
    const available = order.amount - (order.filled_amount || 0);
    const token = (order.token || "USDC").toUpperCase();

    // When the status is locked, completed, cancelled, expired, or filled (i.e. not active/open),
    // always show the original amount (order.amount) instead of the remaining available amount (which might be 0).
    const status = statusOverride || order.status;
    const isClosedOrLocked = status && ["locked", "completed", "cancelled", "expired", "filled"].includes(status);
    const displayAmount = isClosedOrLocked ? order.amount : available;

    const header = order.type === "sell" ? "📢 <b>New SELL Ad!</b>" : "📢 <b>New BUY Ad!</b>";
    const emoji = order.type === "sell" ? "🔴" : "🟢";
    const badges = getTraderBadges(user, order);
    const hideHandle = Boolean(user?.hide_group_handle || order?.hide_group_handle);
    const username = formatTraderDisplay(user?.username || order?.username, user?.first_name || order?.first_name, hideHandle) + badges;
    const actionVerb = order.type === "sell" ? "wants to sell" : "wants to buy";

    const tokenEmoji = getTokenCustomEmoji(token);
    const tokenDisplay = tokenEmoji ? `${tokenEmoji} ${escapeHTML(token)}` : escapeHTML(token);
    const formattedAmt = formatTokenAmount(displayAmount, token);
    const amountStr = `<b>${formattedAmt.replace(token, tokenDisplay)}</b>`;

    const avgMinutes = (order as any).avg_completion_minutes;
    const avgSpeedText = avgMinutes ? ` (⚡ ~${avgMinutes}m avg)` : "";
    const orderLine = `${emoji} ${username}${avgSpeedText} ${actionVerb} ${amountStr}`;

    const chainRaw = (order.chain || "bsc").toLowerCase();
    const isTestnet = chainRaw.includes("testnet") || chainRaw.includes("sepolia") || chainRaw.includes("devnet");
    const chainLabel = isTestnet
        ? `🧪 DEMO / TESTNET (${escapeHTML(chainRaw.toUpperCase())}) — ⚠️ NO REAL MONEY`
        : `${getChainCustomEmoji(chainRaw)} <b>${escapeHTML(chainRaw.toUpperCase())}</b>`;

    const rateTokenDisplay = tokenEmoji ? `${tokenEmoji}${escapeHTML(token)}` : escapeHTML(token);
    const rateLine = `💰 Rate: ₹${escapeHTML(order.rate.toLocaleString())}/${rateTokenDisplay}`;
    const totalLine = `🧾 Total: ₹${escapeHTML((displayAmount * order.rate).toLocaleString("en-IN", { maximumFractionDigits: 0 }))}`;
    const chainLine = `🔗 Chain: ${chainLabel}`;
    const paymentLine = `💳 Payment: ${escapeHTML(order.payment_methods?.join(", ") || "UPI")}`;

    const lines = [
        isTestnet ? `🧪 <b>[DEMO / TESTNET AD]</b>\n${header}` : header,
        "",
        orderLine,
        rateLine,
        totalLine,
        chainLine,
        paymentLine,
    ];

    if (isTestnet) {
        lines.push(`⚠️ <b>DEMO AD ONLY — FOR TESTING (NO REAL MONEY INVOLVED)</b>`);
    }

    if (order.payment_details?.require_kyc) {
        lines.push(`🛡️ Requirement: <b>KYC Verified Only</b>`);
    }

    if (order.payment_details?.avoid_new_traders || order.payment_details?.new_traders_only) {
        lines.push(`🛡️ Requirement: <b>1+ Completed Trades (No New Traders)</b>`);
    }

    if (order.payment_details?.allowed_dealers && order.payment_details.allowed_dealers.length > 0) {
        lines.push(`👥 Target: <b>Specific Whitelisted Dealers Only</b>`);
    }

    const traderNote = order.payment_details?.note;
    if (traderNote) {
        lines.push(`📝 Note: ${escapeHTML(traderNote)}`);
    }

    if (status === "locked" || status === "filled") {
        lines.push(`🔒 Status: <b>Locked / Trade in Progress</b> ${tgCustomEmoji(TG_CUSTOM_EMOJIS.LOCKED, "⏳")}`);
    } else if (status === "completed") {
        lines.push(`✅ Status: <b>Completed</b>`);
    } else if (status === "cancelled") {
        lines.push(`❌ Status: <b>Cancelled</b>`);
    } else if (status === "expired") {
        lines.push(`⏱️ Status: <b>Expired</b>`);
    } else if (order.expires_at) {
        const timeRemaining = formatTimeRemaining(order.expires_at);
        lines.push(`⏱️ Expires in: <b>${timeRemaining}</b>`);
    }

    return lines.join("\n");
}

export async function broadcastAd(order: any, user: any) {
    try {
        const botUser = await getBotInfo();
        const actionLabel = order.type === 'sell' ? '⚡ Buy Now' : '⚡ Sell Now';
        const botUsername = botUser.username;

        // If ad originated from WhatsApp (or user is WhatsApp-only without telegram), direct button to WhatsApp DM
        const isWaAd = Boolean(
            order?.source === "whatsapp" ||
            (!user?.telegram_id && (user?.whatsapp_phone || user?.phone_number)) ||
            (!order?.users?.telegram_id && order?.users?.whatsapp_phone)
        );

        const waBotPhone = env.WA_BOT_NUMBER || "917012751478";
        const targetUrl = isWaAd
            ? `https://wa.me/${waBotPhone}?text=trade_ad_${order.id}`
            : `https://t.me/${botUsername}?start=buy_${order.id}`;

        const keyboard = new InlineKeyboard().url(actionLabel, targetUrl);

        if (order.type === 'sell') {
            keyboard.success();
        } else {
            keyboard.danger();
        }

        const msgText = buildAdMessageText(order, user);
        const results = await broadcast(msgText, keyboard, "HTML");

        // Save broadcast record so we can edit/delete it when filled/expired/cancelled
        if (results.length > 0) {
            const records = results.map(r => ({
                order_id: order.id,
                chat_id: r.chatId,
                message_id: r.messageId
            }));
            await db.saveAdBroadcasts(records);
            console.log(`[Bot] Saved ${records.length} broadcast records for order ${order.id}`);
        }
    } catch (e) {
        console.error("BroadcastAd error:", e);
    }
}

export async function broadcastKycApprovalTelegram(user: any): Promise<void> {
    try {
        const botUser = await getBotInfo();
        const botUsername = botUser.username;
        const keyboard = new InlineKeyboard().url("🛡️ Get KYC Verified", `https://t.me/${botUsername}?start=kyc`);

        const { fmtKycApprovedBroadcast } = await import("../whatsapp/formatters");
        const msgText = fmtKycApprovedBroadcast(user);
        await broadcast(msgText, keyboard, "Markdown");
    } catch (e) {
        console.error("[TG] KYC Broadcast error:", e);
    }
}

export async function updateAdBroadcasts(order: any, user: any, statusOverride?: string): Promise<{ chat_id: number; message_id: number }[]> {
    const processedBroadcasts: { chat_id: number; message_id: number }[] = [];
    try {
        const botUser = await getBotInfo();
        const actionLabel = order.type === 'sell' ? '⚡ Buy Now' : '⚡ Sell Now';
        const botUsername = botUser.username;

        let keyboard: InlineKeyboard | undefined;
        // If there is no status override, or if it is explicitly 'active', show the button.
        // Otherwise (locked, completed, cancelled, expired), remove the keyboard.
        if (!statusOverride || statusOverride === 'active') {
            const isWaAd = Boolean(
                order?.source === "whatsapp" ||
                user?.preferred_channel === "whatsapp" ||
                user?.whatsapp_phone ||
                (user?.phone_number && !user?.telegram_id) ||
                order?.users?.whatsapp_phone
            );

            const waBotPhone = env.WA_BOT_NUMBER || "917012751478";
            const targetUrl = isWaAd
                ? `https://wa.me/${waBotPhone}?text=trade_ad_${order.id}`
                : `https://t.me/${botUsername}?start=buy_${order.id}`;

            keyboard = new InlineKeyboard().url(actionLabel, targetUrl);

            if (order.type === 'sell') {
                keyboard.success();
            } else {
                keyboard.danger();
            }
        }

        const broadcasts = await db.getAdBroadcasts(order.id);
        if (broadcasts.length === 0) return [];

        // Always fetch fresh user record from DB to ensure privacy mode preference is 100% up-to-date
        let freshUser = user;
        if (order.user_id) {
            const dbUser = await db.getUserById(order.user_id);
            if (dbUser) freshUser = dbUser;
        } else if (user?.telegram_id) {
            const dbUser = await db.getUserByTelegramId(user.telegram_id);
            if (dbUser) freshUser = dbUser;
        }

        const msgText = buildAdMessageText(order, freshUser, statusOverride);

        for (const b of broadcasts) {
            let success = false;
            let isTerminalError = false;
            try {
                await bot.api.editMessageText(b.chat_id, b.message_id, msgText, {
                    parse_mode: "HTML",
                    reply_markup: keyboard,
                    link_preview_options: { is_disabled: true }
                });
                success = true;
            } catch (err: any) {
                const msg = err.description || err.message || "";
                if (msg.includes("custom emoji") || msg.includes("CUSTOM_EMOJI")) {
                    try {
                        await bot.api.editMessageText(b.chat_id, b.message_id, stripTgCustomEmojis(msgText), {
                            parse_mode: "HTML",
                            reply_markup: keyboard,
                            link_preview_options: { is_disabled: true }
                        });
                        success = true;
                    } catch (fbErr) {
                        // continue with standard error handling
                    }
                }
                if (msg.includes("message is not modified") ||
                    msg.includes("message to edit not found") ||
                    msg.includes("deactivated") ||
                    msg.includes("blocked") ||
                    msg.includes("kicked") ||
                    msg.includes("chat not found") ||
                    msg.includes("forbidden") ||
                    msg.includes("group chat was deactivated")
                ) {
                    isTerminalError = true;
                } else {
                    console.warn(`[Bot] Failed to edit broadcast message ${b.message_id} in chat ${b.chat_id} (Retrying later):`, msg);
                }
            }

            if (success || isTerminalError) {
                processedBroadcasts.push(b);
            }

            // ⏳ Small 50ms delay to respect Telegram's rate limits
            await new Promise(r => setTimeout(r, 50));
        }
    } catch (e) {
        console.error("updateAdBroadcasts error:", e);
    }
    return processedBroadcasts;
}

export async function deleteAdBroadcasts(orderId: string, statusOverride?: string) {
    try {
        const broadcasts = await db.getAdBroadcasts(orderId);
        if (broadcasts.length === 0) return;

        const order = await db.getOrderById(orderId);
        if (order) {
            console.log(`[Bot] Retaining/updating ${broadcasts.length} broadcast messages in group for order ${orderId} (Type: ${order.type}, Status: ${statusOverride || order.status}).`);
            const user = await db.getUserById(order.user_id);
            const processed = await updateAdBroadcasts(order, user, statusOverride || order.status);

            // Delete only the successfully processed broadcasts from database
            for (const b of processed) {
                await db.deleteSpecificAdBroadcast(orderId, b.chat_id, b.message_id);
            }
        } else {
            // If the order has been deleted from DB entirely, clean up all broadcast records
            await db.deleteAdBroadcasts(orderId);
        }
    } catch (e) {
        console.error("deleteAdBroadcasts error:", e);
    }
}

async function ensureUser(ctx: BotContext): Promise<User> {
    const from = ctx.from!;
    console.log(`DEBUG: ensureUser for ${from.id}...`);

    // Add a race to prevent hanging forever on DB issues
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database timeout in ensureUser")), 10000)
    );

    return Promise.race([
        db.getOrCreateUser(
            from.id,
            from.username || undefined,
            from.first_name || undefined
        ),
        timeout
    ]) as Promise<User>;
}

function isAdmin(ctx: BotContext): boolean {
    return env.ADMIN_IDS.includes(ctx.from?.id || 0);
}

// ═══════════════════════════════════════════════════════════════
//                     /start COMMAND
// ═══════════════════════════════════════════════════════════════

// 🛡️ Middleware: Block Banned Users from Bot Commands & Callbacks
bot.use(async (ctx, next) => {
    if (ctx.from) {
        try {
            const dbUser = await db.getUserByTelegramId(ctx.from.id);
            if (dbUser && dbUser.is_banned) {
                if (ctx.callbackQuery) {
                    await ctx.answerCallbackQuery({
                        text: "⛔ Your account has been restricted from trading. Contact support",
                        show_alert: true
                    });
                    return;
                }
                if (ctx.message?.text?.startsWith("/")) {
                    await ctx.reply("⛔ Your account has been restricted from trading. Please contact support for assistance.");
                    return;
                }
            }
        } catch { /* ignore */ }
    }
    await next();
});

// 🛡️ Middleware: Restrict trading to Private Chats + Deep Linking for Groups
bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== "private" && ctx.message?.text?.startsWith("/")) {
        const text = ctx.message.text!;
        const cmd = text.split(" ")[0].split("@")[0];
        const restricted = [
            "/newad", "/sell", "/buy", "/wallet", "/myads", "/mytrades",
            "/balance", "/deposit", "/withdraw", "/ads", "/liveads",
            "/market", "/send", "/profile", "/payment", "/phone", "/bank"
        ];

        if (restricted.includes(cmd)) {
            const username = ctx.me.username;
            const chatId = ctx.chat.id;
            // Redirect to DM with context
            const startPayload = (cmd === "/newad" || cmd === "/sell") ? `${cmd.replace("/", "")}_${chatId}` : "dm";

            const keyboard = new InlineKeyboard()
                .url("🚀 Go to DM", `https://t.me/${username}?start=${startPayload}`);

            await ctx.reply(
                [
                    "💸 *Ready to Trade?* ⚡",
                    "",
                    "Browsing and listing ads is super easy, but we jump into DMs to keep your details safe\\.",
                    "",
                    "📦 *Tap below to Open Bot*, then launch the *P2PFather App* to finish\\! 🏁",
                ].join("\n"),
                {
                    parse_mode: "Markdown",
                    reply_markup: keyboard
                }
            );
            return;
        }
    }
    await next();
});


// Auto-register groups on any message (so groups survive deploys without re-adding bot)
bot.use(async (ctx, next) => {
    if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
        groupManager.addGroup(ctx.chat.id).catch(console.error);
    }
    await next();
});

// 🎩 Telegram Group Unofficial OTC Offer Detector & Godfather Nudge System
const groupOtcNudgeCooldown = new Map<string, number>();

export function isUnofficialGroupOtcPost(text: string): boolean {
    if (!text || text.length < 3) return false;
    const lower = text.toLowerCase();

    // Ignore official bot messages or commands
    if (lower.startsWith('/') || lower.includes('p2pfather') || lower.includes('escrow') || lower.includes('miniapp')) return false;

    // Shorthand deal pattern (e.g. "15@101.", "50@92.5")
    if (/\b\d+(?:\.\d+)?\s*@\s*\d+(?:\.\d+)?/.test(lower)) return true;

    // Pattern 1: Token/Currency indicators (including "$ 200", "2000 $", "14.88usdt", "250 dt")
    const hasToken = /\b(usdt|dt|usdc|bnb|eth|usd)\b|\$\s*\d+|\d+\s*\$|\d+(?:\.\d+)?\s*(usdt|dt)\b/.test(lower);

    // Pattern 2: Deal terms & OTC keywords
    const hasDealTerms = /\b(by\s*hand|byhand|cdm|f2f|cash|lakh|daily|upi|trc20|dm|direct|calicut|kochi|kerala)\b/.test(lower);

    // Pattern 3: Trade intent & Rate indicators
    const hasIntent = /\b(available|for sale|want to sell|wts|wtb|looking for|arkelum venel|venel|sale|buying|seller|buyer)\b|rate\s*[:\-@]?|price\s*[:\-]?|per\s*\d+|@\s*\d+/.test(lower);

    // Matches if message combines token/currency + (deal terms OR trade intent/rate)
    if (hasToken && (hasDealTerms || hasIntent)) return true;

    // Direct strong indicators (e.g. "250 dt for sale", "usdt available", "100 usdt for sale", "300$ available")
    if (/\b(usdt|dt|\$)\b.*\b(available|for sale|sale|wts|wtb|by\s*hand|byhand|cdm|dm)\b/.test(lower)) return true;
    if (/\b(available|for sale|sale|wts|wtb|by\s*hand|byhand|cdm|dm)\b.*\b(usdt|dt|\$)\b/.test(lower)) return true;

    return false;
}

export function detectOtcSide(text: string): "sell" | "buy" {
    const lower = text.toLowerCase();
    if (/\b(wtb|want to buy|buying|need usdt|need dt|looking for seller|buy usdt|buy dt)\b/.test(lower)) {
        return "buy";
    }
    return "sell";
}

const GODFATHER_SELL_NUDGE_TEMPLATES = [
    "🎩 *In this family, rule #1 is simple:* Never sell crypto without escrow protection! Post your SELL ad in the **P2PFather MiniApp** where your USDT is locked safe until cash hits your account.",
    "💼 *Capo, posting direct SELL offers in chat is how traders lose USDT to fake receipts!* Move your sell offer to the **P2PFather MiniApp** — 1-tap setup, 100% smart contract security.",
    "🕶️ *A real seller doesn't gamble on raw text messages.* In our syndicate, all legit sellers list on the **P2PFather MiniApp**! Lock your sell offer in escrow and trade like a boss.",
    "🎩 *Don't let scammers play with your hard-earned crypto!* Put your sell order in the **P2PFather MiniApp** — buyer pays into escrow first, you release when funds hit your bank!",
    "💼 *We do clean, professional business here!* Don't advertise raw sell deals in chat. Post your SELL offer in the **P2PFather MiniApp** and let buyers trade with you safely.",
    "🕶️ *Ey Don, someone in your DMs might promise high rates*, but only smart-contract escrow guarantees your payout! Move your SELL deal to the **P2PFather MiniApp** now.",
    "🎩 *Respect the trade!* Post your SELL offer in the **P2PFather MiniApp** where verified buyers deal with zero risk and instant automated payouts."
];

const GODFATHER_BUY_NUDGE_TEMPLATES = [
    "🎩 *Looking to BUY crypto, Don?* Never send bank payments directly to strangers in chat! Place your BUY ad in the **P2PFather MiniApp** where seller crypto is locked in escrow first.",
    "💼 *Capo, buying crypto through group DMs is risky business!* Create a BUY order on the **P2PFather MiniApp** so seller crypto is automatically escrowed before you pay.",
    "🕶️ *Smart buyers trade with smart-contract protection.* Post your BUY request on the **P2PFather MiniApp** and let verified sellers deal with you safely!",
    "🎩 *Protect your cash, boss!* In our family, buyers only pay when the seller's crypto is locked in **P2PFather Escrow**. Create your BUY order in the MiniApp now.",
    "💼 *Clean business only!* Don't ask for buy deals in raw text. Post your BUY offer in the **P2PFather MiniApp** so seller crypto is locked upfront."
];

// Middleware: Intercept informal group OTC sale posts and nudge user with Godfather Mafia persona
bot.use(async (ctx, next) => {
    if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') && ctx.message?.text) {
        const text = ctx.message.text;
        const userId = ctx.from?.id;
        if (userId && isUnofficialGroupOtcPost(text)) {
            const cooldownKey = `${userId}:${ctx.chat.id}`;
            const lastNudge = groupOtcNudgeCooldown.get(cooldownKey) || 0;
            const now = Date.now();

            if (now - lastNudge > 600000) { // 10 minutes per-user cooldown in group
                groupOtcNudgeCooldown.set(cooldownKey, now);

                const side = detectOtcSide(text);
                const pool = side === "buy" ? GODFATHER_BUY_NUDGE_TEMPLATES : GODFATHER_SELL_NUDGE_TEMPLATES;
                const template = pool[Math.floor(Math.random() * pool.length)];
                const buttonLabel = side === "buy" ? "🔴 Post BUY Ad in MiniApp" : "🟢 Post SELL Ad in MiniApp";

                const miniAppUrl = `https://p2pfather.com/miniapp/create?type=${side}`;
                const botUsername = ctx.me?.username || "P2p_fatherbot";
                const keyboard = new InlineKeyboard()
                    .webApp(buttonLabel, miniAppUrl)
                    .url("💬 Open MiniApp", `https://t.me/${botUsername}?start=newad_${ctx.chat.id}`);

                try {
                    console.log(`[GodfatherNudge] 🎩 ${side.toUpperCase()} offer detected in group ${ctx.chat.id} from user ${userId}: "${text.slice(0, 40)}..."`);
                    const sentMsg = await ctx.reply(template, {
                        parse_mode: "Markdown",
                        reply_to_message_id: ctx.message.message_id,
                        reply_markup: keyboard,
                    });

                    // Auto-delete nudge reply after 3 minutes (180,000ms) to keep group chat clean
                    setTimeout(async () => {
                        try {
                            await ctx.api.deleteMessage(sentMsg.chat.id, sentMsg.message_id);
                        } catch {
                            // Ignore if message was manually deleted
                        }
                    }, 180000);
                } catch (err: any) {
                    console.error("[GodfatherNudge] Error sending group nudge:", err?.message || err);
                }
            }
        }
    }
    await next();
});

// 🤖 Handle Groups: Automatically track where bot is added
bot.on("my_chat_member", async (ctx) => {
    const chat = ctx.chat;
    // Strictly ignore private chats (DMs) — only track groups, supergroups and channels
    if (chat.type !== "group" && chat.type !== "supergroup" && chat.type !== "channel") {
        return;
    }

    const status = ctx.myChatMember.new_chat_member.status;
    const oldStatus = ctx.myChatMember.old_chat_member.status;

    if (status === "member" || status === "administrator") {
        if (oldStatus === "left" || oldStatus === "kicked" || oldStatus === "restricted") {
            await groupManager.addGroup(chat.id);
            await ctx.reply(
                "🚀 *P2PFather Bot Activated\\!*\n\nI will post live buy/sell ads here\\.",
                { parse_mode: "Markdown" }
            );
        }
    } else if (status === "left" || status === "kicked") {
        await groupManager.removeGroup(chat.id);
    }
});

// Deduplication cache to prevent duplicate welcome messages if both event types trigger
const recentlyWelcomed = new Set<string>();
function shouldWelcome(userId: number, chatId: number): boolean {
    const key = `${userId}:${chatId}`;
    if (recentlyWelcomed.has(key)) return false;
    recentlyWelcomed.add(key);
    setTimeout(() => recentlyWelcomed.delete(key), 15000); // 15 seconds cooldown
    return true;
}

const WELCOME_TEMPLATES = [
    (name: string) => `Hey ${name}, glad to have you on board! 🎩`,
    (name: string) => `Welcome to P2PFather, ${name}! 🚀 Trade safe, trade smart.`,
    (name: string) => `Yo ${name}! Welcome to the inner circle 🤝`,
    (name: string) => `Welcome aboard ${name}! Ready for 100% escrow-secured trades? 💎`,
    (name: string) => `Greetings ${name}! Great to see you in the community 🥂`,
    (name: string) => `Welcome ${name}! Make yourself at home in our P2P trading hub 🔥`,
    (name: string) => `Hey ${name}! Welcome to the family 🎩 Big trades ahead!`,
    (name: string) => `Welcome ${name}! Fast, escrow-protected P2P exchange starts here ⚡`,
    (name: string) => `Hey ${name}! Glad you joined us 🚀 Feel free to ask any questions!`,
    (name: string) => `Welcome to the squad, ${name}! 🤝 Fast escrow at your fingertips.`,
    (name: string) => `Welcome ${name}! 🎩 Glad to have another active trader in the group!`,
    (name: string) => `Hey ${name}! Welcome aboard 🌟 Happy trading!`,
];

async function sendWelcomeMessage(ctx: any, user: { id: number; first_name: string; username?: string; is_bot: boolean }) {
    try {
        if (user.is_bot) return;
        if (!shouldWelcome(user.id, ctx.chat.id)) {
            console.log(`[Welcome] Deduplicated welcome for user ${user.id} in chat ${ctx.chat.id}`);
            return;
        }

        console.log(`[Welcome] Sending welcome message to user ${user.id} (${user.username || user.first_name}) in chat ${ctx.chat.id}`);

        const welcomeNames = user.username ? `@${escapeHTML(user.username)}` : `<b>${escapeHTML(user.first_name)}</b>`;
        const randomTemplate = WELCOME_TEMPLATES[Math.floor(Math.random() * WELCOME_TEMPLATES.length)];
        const welcomeMsg = randomTemplate(welcomeNames);

        const sentMsg = await ctx.api.sendMessage(ctx.chat.id, welcomeMsg, {
            parse_mode: "HTML"
        });
        console.log(`[Welcome] Text welcome sent successfully to ${ctx.chat.id} (Message ID: ${sentMsg.message_id})`);

        // Auto-delete welcome message after 5 minutes (300,000ms) to keep group chat clean
        setTimeout(async () => {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, sentMsg.message_id);
                console.log(`[Welcome] Auto-deleted welcome message ${sentMsg.message_id} in chat ${ctx.chat.id}`);
            } catch (delErr: any) {
                console.log(`[Welcome] Auto-delete skipped/failed for ${sentMsg.message_id} in ${ctx.chat.id}:`, delErr.message || delErr);
            }
        }, 5 * 60 * 1000);
    } catch (e: any) {
        console.error("Welcome new member function error:", e);
        logger.error("Welcome new member error", e);
    }
}

/**
 * 🛡️ Group Guard: Checks if a user is banned or linked to a blocked scammer IP.
 * If true, immediately kicks/bans them from the group.
 */
async function checkAndKickIfScammer(ctx: Context, userId: number, username?: string): Promise<boolean> {
    try {
        if (!ctx.chat?.id || ctx.chat.type === "private") return false;
        
        const dbUser = await db.getUserByTelegramId(userId);
        let isScammer = false;
        let reason = "";

        if (dbUser?.is_banned) {
            isScammer = true;
            reason = "Account is flagged as banned";
        } else if (dbUser?.predictions_cache?.last_ip && IpTrackerService.isIpBlocked(dbUser.predictions_cache.last_ip)) {
            isScammer = true;
            reason = `Accessing from blocked scammer IP (${dbUser.predictions_cache.last_ip})`;
            if (dbUser.id) {
                await IpTrackerService.banUser(dbUser.id);
            }
        }

        if (isScammer) {
            console.warn(`[GROUP-GUARD] 🚨 Kicking scammer user ${userId} (@${username || "no_handle"}) from chat ${ctx.chat.id}. Reason: ${reason}`);
            try {
                await ctx.api.banChatMember(ctx.chat.id, userId);
                await ctx.reply(`⛔ User @${username || userId} has been kicked from the group due to security violations.`);
            } catch (kickErr: any) {
                console.error(`[GROUP-GUARD] ⚠️ Could not kick user ${userId} from chat ${ctx.chat.id}:`, kickErr?.message);
            }
            return true;
        }
    } catch (err: any) {
        console.error(`[GROUP-GUARD] Exception checking scammer status for user ${userId}:`, err?.message);
    }
    return false;
}

// 👋 Welcome New Members in Groups (traditional service message fallback)
bot.on("message:new_chat_members", async (ctx) => {
    try {
        console.log(`[Welcome] message:new_chat_members update received in chat ${ctx.chat.id}`);
        const newMembers = ctx.message.new_chat_members;
        if (!newMembers || newMembers.length === 0) return;

        // Skip if the bot itself is added (my_chat_member handles bot activation greeting)
        const botInfo = await getBotInfo();
        const filteredMembers = newMembers.filter(m => m.id !== botInfo.id);
        if (filteredMembers.length === 0) return;

        for (const member of filteredMembers) {
            const isKicked = await checkAndKickIfScammer(ctx, member.id, member.username);
            if (!isKicked) {
                await sendWelcomeMessage(ctx, member);
            }
        }
    } catch (e: any) {
        console.error("Welcome new member message event error:", e);
        logger.error("Welcome new member message event error", e);
    }
});

// 👋 Welcome New Members in Groups via chat_member updates (robust for large supergroups where service messages are disabled)
bot.on("chat_member", async (ctx) => {
    try {
        const update = ctx.chatMember;
        const oldStatus = update.old_chat_member.status;
        const newStatus = update.new_chat_member.status;

        console.log(`[Welcome] chat_member status update in chat ${ctx.chat.id} from user ${update.new_chat_member.user.id}: status changed from '${oldStatus}' to '${newStatus}'`);

        // A user joins when they go from left/kicked to member/restricted
        const isJoin = (oldStatus === "left" || oldStatus === "kicked") &&
            (newStatus === "member" || newStatus === "restricted");

        if (!isJoin) return;

        const isKicked = await checkAndKickIfScammer(ctx, update.new_chat_member.user.id, update.new_chat_member.user.username);
        if (!isKicked) {
            await sendWelcomeMessage(ctx, update.new_chat_member.user);
        }
    } catch (e: any) {
        console.error("Welcome new member chat_member event error:", e);
        logger.error("Welcome new member chat_member event error", e);
    }
});

// 📢 Broadcast command (Admin Only)
bot.command("broadcast", async (ctx) => {
    if (!env.ADMIN_IDS.includes(ctx.from?.id || 0)) {
        return ctx.reply("❌ Unauthorized.");
    }
    const message = ctx.match?.toString().trim();
    if (!message) return ctx.reply("Usage: /broadcast [Message]");

    const userIds = await db.getAllTelegramIds();
    let sent = 0;

    await ctx.reply(`📢 Sending broadcast to ${userIds.length} users...`);

    for (const userId of userIds) {
        try {
            await ctx.api.sendMessage(userId, `📢 *Announcement*\\n\\n${escapeMarkdown(message)}`, { parse_mode: "Markdown" });
            sent++;
            await new Promise(r => setTimeout(r, 50)); // Rate limit safety
        } catch (e) { /* ignore blocked users */ }
    }
    await ctx.reply(`✅ Broadcast complete\\! Sent to ${sent}/${userIds.length} users\\.`);
});

bot.command("ping", async (ctx) => {
    await ctx.reply(`🏓 Pong! (Bot Version: ${new Date().toISOString()})`);
});

bot.command(["start", "open"], async (ctx) => {
    // 🛡️ Restrict command to Private Chats ONLY (prevents errors/spam in groups)
    if (ctx.chat.type !== "private") return;

    // Handle Deep Linking
    const payload = ctx.match?.toString().trim();

    // 1. Group-specific Sell/NewAd
    if (payload && (payload.startsWith("newad_") || payload.startsWith("sell_"))) {
        const parts = payload.split("_");
        const groupId = parts[1]; // Capture group ID

        if (groupId) {
            const miniAppUrl = "https://p2pfather.com/miniapp/create";
            const keyboard = new InlineKeyboard()
                .webApp("📱 Create Ad in Mini App", miniAppUrl);

            await ctx.reply(
                [
                    "📢 *Create a New Ad*",
                    "",
                    "Use our Mini App for the best experience\\! 🚀",
                    "",
                    "Tap below to open the ad creation page:",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
            return;
        }
    }

    // 🆕 REDIRECT PRIVATE AD SETUP TO MINI APP
    if (payload && (payload.startsWith("setup_sell_") || payload.startsWith("setup_buy_"))) {
        const miniAppUrl = "https://p2pfather.com/miniapp/create";
        const keyboard = new InlineKeyboard()
            .webApp("📱 Create Ad in Mini App", miniAppUrl);

        await ctx.reply(
            [
                "📢 *Create a New Ad*",
                "",
                "Use our Mini App for the best experience\\! 🚀",
                "",
                "Tap below to open the ad creation page:",
            ].join("\n"),
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
        return;
    }

    // 2. Buy / Trade specific order from ad link (Default Telegram MiniApp behavior)
    if (payload && (payload.startsWith("buy_") || payload.startsWith("trade_"))) {
        const orderId = payload.replace("buy_", "").replace("trade_", "");
        const order = await db.getOrderById(orderId);
        if (order && order.status === "active") {
            const seller = await db.getUserById(order.user_id);
            const isWaMerchant = Boolean(
                order.source === "whatsapp" ||
                seller?.preferred_channel === "whatsapp" ||
                (seller?.whatsapp_phone && !seller?.telegram_id)
            );

            if (isWaMerchant) {
                const waBotPhone = env.WA_BOT_NUMBER || "917012751478";
                const keyboard = new InlineKeyboard()
                    .url("💬 Trade via WhatsApp Bot", `https://wa.me/${waBotPhone}?text=trade_ad_${order.id}`)
                    .row()
                    .url("🌐 Open Web Dashboard", "https://p2pfather.com/webapp");

                await ctx.reply(
                    `💬 *WhatsApp Merchant Ad*\n\nThis ad was posted by a verified WhatsApp merchant (${escapeMarkdown(seller?.first_name || "Merchant")}).\n\nTo trade safely with this merchant, please open the trade in WhatsApp or on the Web Dashboard:`,
                    { parse_mode: "Markdown", reply_markup: keyboard }
                );
                return;
            }

            const cacheBuster = `?v=${Date.now()}`;
            const miniAppUrl = `https://p2pfather.com/miniapp/trade/new/${orderId}${cacheBuster}`;
            const keyboard = new InlineKeyboard().webApp(`⚡ Open Trade`, miniAppUrl);
            await ctx.reply(`🔍 *Viewing Ad \\#${escapeMarkdown(orderId.slice(0, 8))}*`, { parse_mode: "Markdown", reply_markup: keyboard });
            return;
        } else {
            await ctx.reply("❌ Ad not found or no longer active.");
            return;
        }
    }

    // Deep link from WhatsApp: generate link code for WhatsApp user
    if (payload === "linkwa" || payload === "link_wa") {
        const user = await ensureUser(ctx);
        const code = await db.createWhatsappLinkCode(user.id);
        const waPhone = env.WA_BOT_NUMBER || "917012751478";
        const waLink = `https://wa.me/${waPhone}?text=/link%20${code}`;

        const keyboard = new InlineKeyboard()
            .url("💬 Send Code to WhatsApp", waLink);

        await ctx.reply(
            `🔗 *LINK YOUR WHATSAPP ACCOUNT*\n\nYour 6-digit WhatsApp Link Code is:\n\n🔑 \`${code}\`\n\n*How to finish linking:*\n1. Tap the button below to open WhatsApp\n2. Or send \`/link ${code}\` to our WhatsApp bot (+${waPhone})\n\n⏳ _Code is valid for 10 minutes._`,
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
        return;
    }

    // Deep link from Web Dashboard: ?start=link_123456
    if (payload && payload.startsWith("link_")) {
        const inputCode = payload.replace("link_", "").trim();
        const from = ctx.from!;
        const linked = await db.linkTelegramByCode(
            from.id,
            from.username || null,
            from.first_name || null,
            inputCode
        );

        if (linked) {
            await ctx.reply(
                `🎉 *Account Linked Successfully!*\n\nYour Telegram account (@${escapeMarkdown(from.username || from.first_name || "")}) is now linked to your P2PFather Web Dashboard profile.\n\nYou can return to the Web Dashboard now! 🚀`,
                { parse_mode: "Markdown" }
            );
        } else {
            await ctx.reply(
                `❌ *Invalid or Expired Link Code*\n\nPlease generate a fresh link code from your Web Dashboard Profile.`,
                { parse_mode: "Markdown" }
            );
        }
        return;
    }

    // 3. Referral deep link
    if (payload && payload.startsWith("ref_") && ctx.from) {
        const referrerTelegramId = parseInt(payload.replace("ref_", ""));
        if (!isNaN(referrerTelegramId) && referrerTelegramId !== ctx.from.id) {
            // Check if this referred user is new to our bot database
            const existingUser = await db.getUserByTelegramId(ctx.from.id);
            if (!existingUser) {
                // Record the referral in DB with 'pending' status
                await db.recordReferral(referrerTelegramId, ctx.from.id);

                // Check if they are ALREADY a member of our community group right now
                let isAlreadyMember = false;
                if (env.COMMUNITY_CHAT_ID) {
                    try {
                        const member = await ctx.api.getChatMember(Number(env.COMMUNITY_CHAT_ID), ctx.from.id);
                        isAlreadyMember = ["member", "administrator", "creator", "restricted"].includes(member.status);
                        if (isAlreadyMember) {
                            // Mark completed immediately
                            await db.updateReferralStatus(ctx.from.id, "completed");

                            // Notify referrer immediately!
                            await ctx.api.sendMessage(
                                referrerTelegramId,
                                `🎉 *New Qualified Referral!*\n\n@${escapeMarkdown(ctx.from.username || ctx.from.first_name || "Someone")} joined the bot and is already a member of the community group! Your referral is qualified! 🚀`,
                                { parse_mode: "Markdown" }
                            ).catch(() => { });
                        }
                    } catch (e) {
                        // ignore
                    }
                }

                if (!isAlreadyMember) {
                    // Send a special welcome message prompting them to join the group to complete verification
                    const verifyKeyboard = new InlineKeyboard()
                        .url("📢 Join Community Group", env.COMMUNITY_INVITE_LINK).row()
                        .text("✅ Verify Membership & Start", `verify_referral:${referrerTelegramId}`);

                    await ctx.reply(
                        [
                            "👋 *Welcome to P2PFather Kerala\\!*",
                            "",
                            `You were invited by a community member\\!`,
                            "",
                            "To complete your registration and help your referrer earn their referral point, please join our official community group and click **Verify** below\\! 🚀",
                        ].join("\n"),
                        { parse_mode: "Markdown", reply_markup: verifyKeyboard }
                    );
                    return;
                }
            }
        }
    }

    const user = await ensureUser(ctx);

    // Auto-create wallet if user doesn't have one
    let walletInfo = "";
    let isNewUser = false;
    if (!user.wallet_address && env.MASTER_WALLET_SEED) {
        try {
            const derived = wallet.deriveWallet(user.wallet_index);
            await db.updateUser(user.id, { wallet_address: derived.address });
            isNewUser = true;
            walletInfo = [
                "",
                "🎉 *Wallet Created Automatically!*",
                `💳 Address: \`${derived.address}\``,
                "",
                "Your wallet is ready to receive USDC.",
            ].join("\n");
        } catch (err) {
            console.error("Wallet creation failed:", err);
        }
    } else if (user.wallet_address) {
        walletInfo = `\n💳 Wallet: \`${truncateAddress(user.wallet_address)}\``;
    }

    const upiStatus = user.upi_id
        ? `📱 UPI: \`${user.upi_id}\``
        : "📱 UPI: Not set";
    const phoneStatus = user.phone_number
        ? `📞 Phone: \`${user.phone_number}\``
        : "";
    const bankStatus = user.bank_account_number
        ? `🏦 Bank: \`${user.bank_account_number}\` (${user.bank_ifsc || ''})`
        : "";
    const paymentStatus = [upiStatus, phoneStatus, bankStatus].filter(Boolean).join("\n");
    const hasPayment = user.upi_id || user.phone_number || user.bank_account_number;

    const welcome = [
        `👋 *Welcome to the P2PFather Platform*`,
        "",
        "Secure, decentralized settlement at your fingertips\\.",
        "",
        "🔐 *Your Wallet Address:*",
        `\`${escapeMarkdown(user.wallet_address || '')}\``,
        "",
        "🚀 *Ready to Trade?*",
        "Open our Mini App to browse ads, manage your portfolio, and list your own offers in a few taps\\!",
    ].join("\n");

    const cacheBuster = `?v=${Date.now()}`;
    const miniAppUrl = `https://p2pfather.com/miniapp${cacheBuster}`;

    // Forcefully overwrite the menu button for this specific user's chat
    // This fixes issues where older accounts cached the previous hosting URL
    try {
        // --- UPDATING MENU BUTTON ---
        await ctx.api.setChatMenuButton({
            chat_id: ctx.chat.id,
            menu_button: {
                type: "web_app",
                text: "Open App",
                web_app: { url: miniAppUrl }
            }
        });
    } catch (err) {
        console.error("Failed to update user specific menu button:", err);
        await ctx.reply(`*🛠 System Debug Error*\\nFailed to update menu button: ${escapeMarkdown(String(err))}`, { parse_mode: "Markdown" });
    }
    const bannerPath = path.join(process.cwd(), "assets/bot_logo.jpg");

    const startKeyboard = new InlineKeyboard()
        .webApp("🚀 Launch P2PFather App", miniAppUrl).row()
        .url("📢 Join Community Group", env.COMMUNITY_INVITE_LINK).row()
        .text("📊 Browse Live Ads", "ads:all")
        .text("👤 My Profile", "view_profile").row()
        .text("💼 My Wallet & Vault", "view_wallet")
        .url("📚 User Guide & Help", "https://p2pfather.com/guide");

    // Send hero banner with the welcome text
    await ctx.replyWithPhoto(new InputFile(bannerPath), {
        caption: welcome,
        parse_mode: "Markdown",
        reply_markup: startKeyboard
    });

    // If new user, immediately ask for UPI
    if (isNewUser && !user.upi_id) {
        setTimeout(async () => {
            const keyboard = new InlineKeyboard()
                .text("📱 Set UPI Now", "setup_upi")
                .row()
                .text("⏭️ Skip for Now", `cancel_action:${user.id}`);

            await ctx.reply(
                [
                    "📱 *One more step — Set your UPI ID*",
                    "",
                    "You'll need UPI to receive/send fiat payments\\.",
                    "",
                    "Examples:",
                    "• \`yourname@upi\`",
                    "• \`9876543210@paytm\`",
                    "• \`yourname@okicici\`",
                    "",
                    "Tap below or just type your UPI ID:",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
            ctx.session.awaiting_input = "upi_id";
        }, 1500); // Small delay so user reads welcome first
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /upi COMMAND
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//              TRADE DM NOTIFICATION HELPER
// ═══════════════════════════════════════════════════════════════

async function notifyTrader(telegramId: number, message: string) {
    try {
        await bot.api.sendMessage(telegramId, escapeMarkdown(message), { parse_mode: "Markdown" });
    } catch (err) {
        console.error(`Failed to notify user ${telegramId}:`, err);
    }
}

// ═══════════════════════════════════════════════════════════════
//                  /payment COMMAND (replaces /upi)
// ═══════════════════════════════════════════════════════════════

bot.command("payment", async (ctx) => {
    const user = await ensureUser(ctx);

    const status = [
        "💳 *Your Payment Methods*",
        "",
        `📱 UPI: ${user.upi_id ? `\`${user.upi_id}\`` : '❌ Not set'}`,
        `📞 Phone: ${user.phone_number ? `\`${user.phone_number}\`` : '❌ Not set'}`,
        `🏦 Bank: ${user.bank_account_number ? `\`${user.bank_account_number}\` (${user.bank_ifsc || ''})` : '❌ Not set'}`,
        "",
        "*Set up:*",
        "• `/upi yourname@upi` — Set UPI",
        "• `/phone 9876543210` — Set phone",
        "• `/bank ACCT_NO IFSC_CODE` — Set bank",
        "",
        "Or use the Mini App for the easiest setup! 📱",
    ].join("\n");

    const cacheBuster = `?v=${Date.now()}`;
    const miniAppUrl = `https://p2pfather.com/miniapp/profile${cacheBuster}`;
    const keyboard = new InlineKeyboard()
        .webApp("📱 Open Profile", miniAppUrl)
        .row()
        .text("📱 Set UPI", "setup_upi")
        .text("📞 Set Phone", "setup_phone")
        .row()
        .text("🏦 Set Bank", "setup_bank");

    await ctx.reply(status, { parse_mode: "Markdown", reply_markup: keyboard });
});

// /upi alias (kept for backward compat)
bot.command("upi", async (ctx) => {
    const user = await ensureUser(ctx);

    const args = ctx.match?.trim();
    if (args && args.includes("@")) {
        await db.updateUser(user.id, { upi_id: args });
        await ctx.reply(
            [
                "✅ *UPI ID Updated!*",
                "",
                `📱 UPI: \`${args}\``,
                "",
                "You're all set to trade! Try /newad",
            ].join("\n"),
            { parse_mode: "Markdown" }
        );
        return;
    }

    if (user.upi_id) {
        const keyboard = new InlineKeyboard()
            .text("✏️ Change UPI", "setup_upi")
            .text("✅ Keep Current", `cancel_action:${user.id}`);

        await ctx.reply(
            [
                "📱 *Your UPI ID*",
                "",
                `Current: \`${user.upi_id}\``,
                "",
                "Want to change it?",
            ].join("\n"),
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
    } else {
        ctx.session.awaiting_input = "upi_id";
        await ctx.reply(
            [
                "📱 *Set Your UPI ID*",
                "",
                "Send your UPI ID to receive/send fiat payments.",
                "",
                "Examples:",
                "• `yourname@upi`",
                "• `9876543210@paytm`",
                "• `yourname@okaxis`",
                "• `yourname@okicici`",
            ].join("\n"),
            { parse_mode: "Markdown" }
        );
    }
});

// /phone command
bot.command("phone", async (ctx) => {
    const user = await ensureUser(ctx);
    const args = ctx.match?.trim();
    const cleaned = args?.replace(/\D/g, '') || '';

    if (cleaned.length >= 10) {
        await db.updateUser(user.id, { phone_number: cleaned });

        // ── Production: auto-merge WA-only account if phone matches ──────────
        try {
            const { data: waUser } = await (db as any).getClient()
                .from("users")
                .select("*")
                .eq("whatsapp_phone", cleaned)
                .maybeSingle();

            if (waUser && waUser.id !== user.id) {
                // Migrate orders and trades
                await (db as any).getClient().from("orders").update({ user_id: user.id }).eq("user_id", waUser.id);
                await (db as any).getClient().from("trades").update({ buyer_id: user.id }).eq("buyer_id", waUser.id);
                await (db as any).getClient().from("trades").update({ seller_id: user.id }).eq("seller_id", waUser.id);

                // Inherit WA wallet if Telegram user has none
                if (!user.wallet_address && waUser.wallet_address) {
                    await db.updateUser(user.id, {
                        wallet_address: waUser.wallet_address,
                        wallet_index: waUser.wallet_index,
                    } as any);
                }

                // Link the WA phone and clean up the old WA-only row
                await db.updateUser(user.id, { whatsapp_phone: cleaned, preferred_channel: "both" } as any);
                await (db as any).getClient().from("whatsapp_states").delete().eq("user_id", waUser.id);
                await (db as any).getClient().from("users").delete().eq("id", waUser.id);

                await ctx.reply(
                    `✅ Phone number updated: \`${escapeMarkdown(cleaned)}\`\n\n` +
                    `🔗 *WhatsApp account automatically linked!*\n` +
                    `Your existing WhatsApp history and wallet have been merged into this account.`,
                    { parse_mode: "Markdown" }
                );
                return;
            }
        } catch (e) {
            // Auto-merge failed silently — non-critical, user can still link via OTP
            console.error("[BOT] Auto WA merge failed:", e);
        }

        await ctx.reply(`✅ Phone number updated: \`${escapeMarkdown(cleaned)}\``, { parse_mode: "Markdown" });
        return;
    }

    ctx.session.awaiting_input = "phone_number";
    await ctx.reply(
        [
            "📞 *Set Your Phone Number*",
            "",
            user.phone_number ? `Current: \`${escapeMarkdown(user.phone_number)}\`` : "Not set yet\\.",
            "",
            "Send your 10\\-digit mobile number:",
        ].join("\n"),
        { parse_mode: "Markdown" }
    );
});

// /bank command
bot.command("bank", async (ctx) => {
    const user = await ensureUser(ctx);
    const args = ctx.match?.trim();

    if (args) {
        const parts = args.split(/\s+/);
        if (parts.length >= 2) {
            const updates: Record<string, any> = {
                bank_account_number: parts[0],
                bank_ifsc: parts[1].toUpperCase(),
            };
            if (parts[2]) updates.bank_name = parts.slice(2).join(' ');
            await db.updateUser(user.id, updates as any);
            await ctx.reply(
                [
                    "✅ *Bank Details Updated\\!*",
                    "",
                    `🏦 Account: \`${escapeMarkdown(parts[0])}\``,
                    `IFSC: \`${escapeMarkdown(parts[1].toUpperCase())}\``,
                    parts[2] ? `Bank: ${escapeMarkdown(parts.slice(2).join(' '))}` : "",
                ].join("\n"),
                { parse_mode: "Markdown" }
            );
            return;
        }
    }

    ctx.session.awaiting_input = "bank_details";
    await ctx.reply(
        [
            "🏦 *Set Your Bank Details*",
            "",
            user.bank_account_number
                ? `Current: \`${escapeMarkdown(user.bank_account_number)}\` (${escapeMarkdown(user.bank_ifsc || '')})`
                : "Not set yet\\.",
            "",
            "Send: \`ACCOUNT_NUMBER IFSC_CODE BANK_NAME\`",
            "Example: \`1234567890 SBIN0001234 SBI\`",
        ].join("\n"),
        { parse_mode: "Markdown" }
    );
});

bot.command("newad", async (ctx) => {
    const cacheBuster = `?v=${Date.now()}`;
    const miniAppUrl = `https://p2pfather.com/miniapp/create${cacheBuster}`;
    const keyboard = new InlineKeyboard()
        .webApp("📱 Create Ad in Mini App", miniAppUrl);

    await ctx.reply(
        [
            "📢 *Create a New Ad*",
            "",
            "Use our Mini App for the best experience\\! 🚀",
            "",
            "Tap below to open the ad creation page:",
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: keyboard }
    );
});

bot.command("send", async (ctx) => {
    const user = await ensureUser(ctx);

    if (!user.wallet_address) {
        await ctx.reply("⚠️ Set up your wallet first\\! Type /start to create one\\.");
        return;
    }

    ctx.session.send_draft = {};

    const keyboard = new InlineKeyboard()
        .text("💵 USDC", "send_token:USDC")
        .text("dt USDT", "send_token:USDT")
        .text("💎 ETH", "send_token:ETH")
        .row()
        .text("❌ Cancel", `cancel_action:${user.id}`);

    await ctx.reply(
        [
            "💸 *Send Crypto*",
            "",
            "Withdraw your funds to any external wallet on Base\\.",
            "",
            "Select the token to send:",
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: keyboard }
    );
});

// Also keep /sell as alias
bot.command("sell", async (ctx) => {
    await ctx.replyWithChatAction("typing").catch(() => { });
    const cacheBuster = `?v=${Date.now()}`;
    const miniAppUrl = `https://p2pfather.com/miniapp/create${cacheBuster}`;
    const keyboard = new InlineKeyboard()
        .webApp("📱 Create Ad in Mini App", miniAppUrl);

    await ctx.reply(
        [
            "📢 *Create a New Ad*",
            "",
            "Use our Mini App for the best experience\\! 🚀",
            "",
            "Tap below to open the ad creation page:",
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: keyboard }
    );
});

// ═══════════════════════════════════════════════════════════════
//                     /ads COMMAND (Browse Live Ads)
// ═══════════════════════════════════════════════════════════════

bot.command(["ads", "liveads"], async (ctx) => {
    await ctx.replyWithChatAction("typing").catch(() => { });
    await ensureUser(ctx);

    const keyboard = new InlineKeyboard()
        .text("🔴 Sell Ads (Buy crypto)", "ads:sell")
        .text("🟢 Buy Ads (Sell crypto)", "ads:buy")
        .row()
        .text("📊 All Ads", "ads:all")
        .row()
        .text("🔍 Filter by Amount", "ads:filter_amount")
        .text("🔍 Filter by Rate", "ads:filter_rate");

    await ctx.reply(
        [
            "📢 *Live P2P Ads*",
            "",
            "Browse active trading ads from the community\\.",
            "",
            "🔴 *Sell Ads* — Traders selling crypto \\(you buy from them\\)",
            "🟢 *Buy Ads* — Traders buying crypto \\(you sell to them\\)",
            "",
            "Select a category below:",
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: keyboard }
    );
});

// ═══════════════════════════════════════════════════════════════
//                     /myads COMMAND (Manage Your Ads)
// ═══════════════════════════════════════════════════════════════

bot.command("myads", async (ctx) => {
    const user = await ensureUser(ctx);

    try {
        const orders = await db.getUserOrders(user.id);
        const activeOrders = orders.filter((o: any) => o.status === "active");
        const pausedOrders = orders.filter((o: any) => o.status === "paused");

        if (orders.length === 0) {
            const keyboard = new InlineKeyboard()
                .text("📢 Create New Ad", "newad_start");

            await ctx.reply(
                [
                    "📋 *My Ads*",
                    "",
                    "You don't have any ads yet\\!",
                    "Create your first ad to start trading\\.",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
            return;
        }

        const sections: string[] = ["📋 *My Ads*", ""];

        if (activeOrders.length > 0) {
            sections.push(`🟢 *Active Ads \\(${activeOrders.length}\\)*`);
            sections.push("");
            activeOrders.forEach((o: any, i: number) => {
                const emoji = o.type === "sell" ? "🔴" : "🟢";
                const available = o.amount - (o.filled_amount || 0);
                sections.push([
                    `${i + 1}\\. ${emoji} *${o.type.toUpperCase()}* ${escapeMarkdown(formatTokenAmount(available))}`,
                    `   Rate: ${escapeMarkdown(formatINR(o.rate))}/USDC | Total: ${escapeMarkdown(formatINR(available * o.rate))}`,
                    `   Payment: ${escapeMarkdown(o.payment_methods?.join(", ") || "UPI")}`,
                    `   🆔 \`${escapeMarkdown(o.id.slice(0, 8))}\``,
                ].join("\n"));
                sections.push("");
            });
        }

        if (pausedOrders.length > 0) {
            sections.push(`⏸️ *Paused Ads \\(${pausedOrders.length}\\)*`);
            pausedOrders.forEach((o: any, i: number) => {
                sections.push(`  ${i + 1}\\. ${escapeMarkdown(o.type.toUpperCase())} ${escapeMarkdown(formatTokenAmount(o.amount))} at ${escapeMarkdown(formatINR(o.rate))}`);
            });
            sections.push("");
        }

        const keyboard = new InlineKeyboard()
            .text("📢 New Ad", "newad_start")
            .text("⏸️ Pause All", "ads:pause_all")
            .row()
            .text("🗑️ Delete All", "ads:delete_all");

        sections.push(
            "━━━━━━━━━━━━━━━━━━━",
            "Actions: Tap ad ID to edit, or use buttons below\\."
        );

        await ctx.reply(sections.join("\n"), { parse_mode: "Markdown", reply_markup: keyboard });
    } catch (error) {
        await ctx.reply("❌ Failed to load your ads\\.");
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /mytrades COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("mytrades", async (ctx) => {
    const user = await ensureUser(ctx);
    try {
        const trades = await db.getUserTrades(user.id);

        if (trades.length === 0) {
            await ctx.reply("📭 You have no active trades\\.");
            return;
        }

        const keyboard = new InlineKeyboard();

        const statusMap: any = {
            'created': '🆕 Created',
            'in_escrow': '🟡 In Escrow',
            'fiat_sent': '🔵 Paid',
            'completed': '✅ Completed',
            'disputed': '🔴 Disputed',
            'cancelled': '❌ Cancelled'
        };

        trades.forEach((t: any) => {
            const isBuyer = t.buyer_id === user.id;
            const role = isBuyer ? "🟢 Buying" : "🔴 Selling";
            const amt = formatTokenAmount(t.amount, t.token);
            const status = statusMap[t.status] || t.status;

            const date = formatShortDate(t.created_at);
            keyboard.text(`${role} ${amt} (${status}) | ${date}`, `trade_view:${t.id}`).row();
        });

        await ctx.reply("📋 *Your Trades*\\nSelect a trade to view actions:", {
            parse_mode: "Markdown",
            reply_markup: keyboard
        });
    } catch (e) {
        console.error("MyTrades error:", e);
        await ctx.reply("❌ Failed to fetch trades\\.");
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /buy COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("buy", async (ctx) => {
    await ctx.replyWithChatAction("typing").catch(() => { });
    await ensureUser(ctx);

    // Show available sell orders
    try {
        const orders = await db.getActiveOrders("sell", undefined, 10);

        if (orders.length === 0) {
            await ctx.reply(
                [
                    "🌟 *Market is Quiet* 🌟",
                    "",
                    "There are no active sell orders right now\\.",
                    "",
                    "✨ Be the first to list an ad and set your own price\\! 🚀",
                ].join("\n"),
                {
                    parse_mode: "Markdown",
                    reply_markup: new InlineKeyboard().webApp("✨ Create Ad", "https://p2pfather.com/miniapp/create")
                }
            );
            return;
        }

        const header = [
            "╭─────────────────────────────╮",
            "│  🏦 P2P FATHER · LIVE ORDERS │",
            "╰─────────────────────────────╯",
        ].join("\n");

        const orderList = orders.map((o) => formatOrder(o)).join("\n\n");

        const keyboard = new InlineKeyboard();
        orders.slice(0, 5).forEach((o) => {
            keyboard.text(`Buy ${formatTokenAmount(o.amount - o.filled_amount)}`, `buy:${o.id}`).row();
        });

        await ctx.reply(
            [
                header,
                "",
                orderList,
                "",
                "⚡ Trade safely on @P2p_fatherbot",
            ].join("\n"),
            { parse_mode: "HTML", reply_markup: keyboard }
        );
    } catch (error) {
        await ctx.reply("❌ Failed to load orders\\. Database may not be configured yet\\.\\n\\nRun /help for setup instructions\\.");
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /orders COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("orders", async (ctx) => {
    await ctx.replyWithChatAction("typing").catch(() => { });
    try {
        const [sellOrders, buyOrders] = await Promise.all([
            db.getActiveOrders("sell", undefined, 5),
            db.getActiveOrders("buy", undefined, 5),
        ]);

        const header = [
            "╭─────────────────────────────╮",
            "│  🏦 P2P FATHER · LIVE ORDERS │",
            "╰─────────────────────────────╯",
        ].join("\n");

        const sections: string[] = [header, ""];
        const keyboard = new InlineKeyboard();

        if (sellOrders.length > 0) {
            sellOrders.forEach((o) => {
                sections.push(formatOrder(o));
                sections.push("");
                const available = o.amount - (o.filled_amount || 0);
                keyboard.text(`🟢 Buy ${formatTokenAmount(available, o.token)} @ ${formatINR(o.rate)}`, `trade_ad:${o.id}`).row();
            });
        }

        if (buyOrders.length > 0) {
            buyOrders.forEach((o) => {
                sections.push(formatOrder(o));
                sections.push("");
                const available = o.amount - (o.filled_amount || 0);
                keyboard.text(`🔴 Sell ${formatTokenAmount(available, o.token)} @ ${formatINR(o.rate)}`, `trade_ad:${o.id}`).row();
            });
        }

        sections.push("⚡ Trade safely on @P2p_fatherbot");

        await ctx.reply(sections.join("\n"), { parse_mode: "HTML", reply_markup: keyboard });
    } catch (error) {
        await ctx.reply("❌ Failed to load orders\\. Database may not be configured yet\\.");
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /balance COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command(["balance", "portfolio"], async (ctx) => {
    const user = await ensureUser(ctx);

    if (!user.wallet_address) {
        await ctx.reply(
            [
                "💰 *Wallet Balance*",
                "",
                "⚠️ No wallet connected yet\\!",
                "",
                "Use /wallet to set up your wallet address\\.",
            ].join("\n"),
            { parse_mode: "Markdown" }
        );
        return;
    }

    try {
        const balances = await wallet.getBalances(user.wallet_address);
        const keyboard = new InlineKeyboard()
            .text("💸 Send USDC", "send_token:USDC")
            .text("💸 Send USDT", "send_token:USDT")
            .row()
            .text("💸 Send ETH", "send_token:ETH")
            .row()
            .text("✨ Create Ad", "newad_start");

        await ctx.reply(
            [
                "💰 *Your Portfolio*",
                "",
                `Address: \`${escapeMarkdown(truncateAddress(user.wallet_address))}\``,
                "",
                `💵 *USDC*: ${escapeMarkdown(balances.usdc)}`,
                `💵 *USDT*: ${escapeMarkdown(balances.usdt)}`,
                `💎 *ETH*: ${escapeMarkdown(balances.eth)}`,
                "",
                "━━━━━━━━━━━━━━━━━━━",
                "Select a token to withdraw or create a trade:",
            ].join("\n"),
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
    } catch (error) {
        await ctx.reply(
            [
                "💰 *Your Wallet*",
                "",
                `Address: \`${escapeMarkdown(truncateAddress(user.wallet_address))}\``,
                "⚠️ Could not fetch balance\\. RPC may be unavailable\\.",
            ].join("\n"),
            { parse_mode: "Markdown" }
        );
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /wallet COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("wallet", async (ctx) => {
    const user = await ensureUser(ctx);

    if (user.wallet_address) {
        const keyboard = new InlineKeyboard()
            .text("📋 Copy Address", `copy:${user.wallet_address}`)
            .row()
            .text("🔑 Export Private Key", "export_key")
            .row()
            .text("📱 Set UPI", "change_upi");

        await ctx.reply(
            [
                "🔑 *Your Wallet*",
                "",
                `💳 Address: \`${escapeMarkdown(user.wallet_address)}\``,
                `📱 UPI: ${escapeMarkdown(user.upi_id || "Not set")}`,
                "",
                "Your wallet was created automatically\\.",
                "You OWN this wallet — export your key anytime\\!",
            ].join("\n"),
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
    } else {
        await ctx.reply(
            [
                "🔑 *Wallet Setup*",
                "",
                "Send me your Base wallet address:",
                "",
                "Example: \`0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18\`",
                "",
                "This is where you'll receive USDC from trades\\.",
            ].join("\n"),
            { parse_mode: "Markdown" }
        );
        ctx.session.awaiting_input = "wallet_address";
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /export COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("export", async (ctx) => {
    // Only allow in private chats (NEVER expose keys in groups)
    if (ctx.chat.type !== "private") {
        await ctx.reply("⚠️ For security, key export is only available in DM\\. Message me directly\\!");
        return;
    }

    const user = await ensureUser(ctx);

    if (!user.wallet_address || !env.MASTER_WALLET_SEED) {
        await ctx.reply("❌ No wallet found\\. Type /start to create one\\.");
        return;
    }

    const keyboard = new InlineKeyboard()
        .text("⚠️ Yes, show my private key", "confirm_export")
        .row()
        .text("❌ Cancel", "cancel_action");

    await ctx.reply(
        [
            "🔒 *Export Private Key*",
            "",
            "⚠️ *WARNING:*",
            "• Anyone with your private key can STEAL your funds",
            "• NEVER share it with anyone",
            "• NEVER paste it on any website",
            "• Screenshot it and keep it OFFLINE",
            "",
            "Are you sure you want to see your private key?",
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: keyboard }
    );
});

// ═══════════════════════════════════════════════════════════════
//                     /profile COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("profile", async (ctx) => {
    const user = await ensureUser(ctx);

    const stars = user.trust_score >= 95 ? "💎" :
        user.trust_score >= 80 ? "⭐" :
            user.trust_score >= 60 ? "🟢" :
                user.trust_score >= 30 ? "🟡" : "🔴";

    const privacyStatus = (user as any).hide_group_handle ? "ON 🔒" : "OFF 🔓";

    await ctx.reply(
        [
            "👤 *Your Profile*",
            "",
            `Name: ${escapeMarkdown(user.first_name || "Anonymous")}`,
            `Username: @${escapeMarkdown(user.username || "not set")}`,
            `Tier: ${escapeMarkdown(user.tier.toUpperCase())}`,
            "",
            "━━━━━━━━━━━━━━━━",
            `${escapeMarkdown(stars)} Trust: ${escapeMarkdown(String(user.trust_score))}%`,
            `📈 Total Trades: ${escapeMarkdown(String(user.trade_count))}`,
            `✅ Completed: ${escapeMarkdown(String(user.completed_trades))}`,
            `📊 Success Rate: ${user.trade_count > 0 ? escapeMarkdown(((user.completed_trades / user.trade_count) * 100).toFixed(0)) : 0}%`,
            "",
            `💳 Wallet: ${user.wallet_address ? `\`${escapeMarkdown(truncateAddress(user.wallet_address))}\`` : "Not set"}`,
            `📱 UPI: ${escapeMarkdown(user.upi_id || "Not set")}`,
            `🔒 Group Privacy Mode: ${escapeMarkdown(privacyStatus)} (Toggle via /privacy)`,
            `🔐 Verified: ${user.is_verified ? "Yes ✅" : "No"}`,
        ].join("\n"),
        { parse_mode: "Markdown" }
    );
});

bot.command("link", async (ctx) => {
    const text = ctx.message?.text?.trim() || "";
    const parts = text.split(/\s+/);
    const passedCode = parts[1];

    if (passedCode && /^\d{6}$/.test(passedCode)) {
        const linked = await db.linkTelegramByCode(
            ctx.from?.id!,
            ctx.from?.username || null,
            ctx.from?.first_name || null,
            passedCode
        );
        if (linked) {
            await ctx.reply(
                `🎉 *Telegram Account Linked Successfully!*\n\nYour Telegram account is now connected to your P2PFather profile!`,
                { parse_mode: "Markdown" }
            );
        } else {
            await ctx.reply(
                `❌ *Invalid or Expired Link Code*\n\nPlease generate a new code from your Web Dashboard Profile.`,
                { parse_mode: "Markdown" }
            );
        }
        return;
    }

    const user = await ensureUser(ctx);
    const code = await db.createWhatsappLinkCode(user.id);
    const waBotNumber = process.env.WA_BOT_NUMBER || "";

    const waLinkUrl = `https://wa.me/${waBotNumber}?text=${encodeURIComponent(`/link ${code}`)}`;

    const kb = new InlineKeyboard()
        .url("📱 Open WhatsApp & Link Now", waLinkUrl);

    await ctx.reply(
        [
            "📱 *Link Your Account*",
            "",
            `Your 6-digit OTP code is: \`${code}\``,
            "_(Valid for 10 minutes)_",
            "",
            "👉 Send `/link " + code + "` in the WhatsApp chat to link.",
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: kb }
    );
});

bot.command("privacy", async (ctx) => {
    try {
        const user = await ensureUser(ctx);
        if (!user) return;

        const currentPrivacy = (user as any).hide_group_handle || false;
        const newPrivacy = !currentPrivacy;

        await db.updateUser(user.id, { hide_group_handle: newPrivacy } as any);

        if (newPrivacy) {
            await ctx.reply(
                "🔒 *Privacy Mode: ACTIVATED*\n\nYour username will now be masked (e.g. `****`) in public group trade announcements. Transaction links will remain attached for protocol transparency.\n\nUse /privacy anytime to toggle.",
                { parse_mode: "Markdown" }
            );
        } else {
            await ctx.reply(
                "🔓 *Privacy Mode: DEACTIVATED*\n\nYour full Telegram handle will be displayed in public group trade announcements.\n\nUse /privacy anytime to toggle.",
                { parse_mode: "Markdown" }
            );
        }
    } catch (err: any) {
        console.error("/privacy command error:", err);
        await ctx.reply("Failed to update privacy settings.");
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /invite COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("invite", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    if (!ctx.from) return;
    await ensureUser(ctx);

    const botInfo = await getBotInfo();
    const inviteLink = `https://t.me/${botInfo.username}?start=ref_${ctx.from.id}`;

    // Fetch stats
    const stats = await db.getReferralsByReferrer(ctx.from.id);

    // Check if there are pending referrals that are now in the group (dynamic updating!)
    if (stats.pending > 0 && env.COMMUNITY_CHAT_ID) {
        let updatedSome = false;
        for (const referral of stats.list) {
            if (referral.status === "pending") {
                try {
                    const member = await ctx.api.getChatMember(Number(env.COMMUNITY_CHAT_ID), referral.referred_telegram_id);
                    const isMember = ["member", "administrator", "creator", "restricted"].includes(member.status);
                    if (isMember) {
                        await db.updateReferralStatus(referral.referred_telegram_id, "completed");
                        referral.status = "completed";
                        updatedSome = true;

                        // Notify referrer
                        await ctx.api.sendMessage(
                            referral.referrer_telegram_id,
                            `🎉 *New Qualified Referral!*\n\nA user you invited has successfully joined the community group! Your referral is now qualified! 🚀`,
                            { parse_mode: "Markdown" }
                        ).catch(() => { });
                    }
                } catch (err) {
                    // Ignore (e.g. user blocked bot or bot not in group)
                }
            }
        }
        if (updatedSome) {
            // Re-fetch updated stats
            const updatedStats = await db.getReferralsByReferrer(ctx.from.id);
            stats.total = updatedStats.total;
            stats.qualified = updatedStats.qualified;
            stats.pending = updatedStats.pending;
        }
    }

    const shareText = `Hey! Join P2PFather, the most secure P2P Crypto Exchange Bot in Kerala. Trade USDC/USDT instantly using UPI and Bank Transfer! 🚀`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(shareText)}`;

    const message = [
        "👥 *P2PFather Referral Program*",
        "",
        "Invite friends to trade on *P2PFather* and grow our community together\\!",
        "",
        "📢 *Rules:*",
        "• The referral counts only when your friend joins our community group\\.",
        "",
        "🔗 *Your Personal Invitation Link:*",
        `\`${escapeMarkdown(inviteLink)}\``,
        "",
        "📊 *Your Referral Stats:*",
        `• 👥 *Total Invited:* \`${stats.total}\``,
        `• ✅ *Qualified (Joined Group):* \`${stats.qualified}\``,
        `• ⏳ *Pending (Not Joined):* \`${stats.pending}\``,
    ].join("\n");

    const cacheBuster = `?v=${Date.now()}`;
    const claimUrl = `https://p2pfather.com/miniapp/claim-rewards${cacheBuster}`;

    const keyboard = new InlineKeyboard()
        .url("🔗 Share Invite Link", shareUrl).row()
        .url("📢 Join Community Group", env.COMMUNITY_INVITE_LINK).row()
        .webApp("💰 Claim Rewards", claimUrl).row()
        .text("🔄 Refresh Stats", "refresh_referrals")
        .text("🏆 Invite Leaderboard", "show_referral_leaderboard");

    await ctx.reply(message, { parse_mode: "Markdown", reply_markup: keyboard });
});

// ═══════════════════════════════════════════════════════════════
//                     /leaderboard COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("leaderboard", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    if (!ctx.from) return;
    await ensureUser(ctx);

    const args = ctx.match ? ctx.match.trim().toLowerCase() : "";

    if (args === "invites" || args === "invite") {
        const dbInstance = (db as any).getClient();
        const { data: referrals, error } = await dbInstance
            .from("referrals")
            .select("referrer_telegram_id, status")
            .eq("status", "completed");

        let leaderboardText = "🏆 *P2PFather Invite Champions*\n\n";

        if (!error && referrals && referrals.length > 0) {
            const counts: Record<number, number> = {};
            for (const ref of referrals) {
                const id = ref.referrer_telegram_id;
                counts[id] = (counts[id] || 0) + 1;
            }

            const referrerIds = Object.keys(counts).map(Number);
            const { data: users } = await dbInstance
                .from("users")
                .select("telegram_id, username, first_name")
                .in("telegram_id", referrerIds);

            const list = (users || []).map((u: any) => ({
                name: u.username ? `@${u.username}` : (u.first_name || "Anonymous"),
                count: counts[u.telegram_id] || 0
            })).sort((a: any, b: any) => b.count - a.count).slice(0, 20);

            if (list.length > 0) {
                let rank = 1;
                for (const item of list) {
                    const rankEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}\\.`;
                    leaderboardText += `${rankEmoji} *${escapeMarkdown(item.name)}* — \`${item.count}\` qualified invites\n`;
                    rank++;
                }
            } else {
                leaderboardText += "No qualified referrals yet\\. Share your link with /invite to top the board\\!";
            }
        } else {
            leaderboardText += "No qualified referrals yet\\. Share your link with /invite to top the board\\!";
        }

        await ctx.reply(leaderboardText, { parse_mode: "Markdown" });
        return;
    }

    const dbInstance = (db as any).getClient();
    const { data: users, error } = await dbInstance.rpc("get_timeframe_leaderboard", {
        p_days: 0,
        p_limit: 10,
        p_offset: 0
    });

    let tradingText = "🛡️ *P2PFather Top Traders (All Time)*\n\n";

    if (!error && users && users.length > 0) {
        let rank = 1;
        for (const u of users) {
            const rankEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}\\.`;
            const name = u.name || "Anonymous";
            tradingText += `${rankEmoji} *${escapeMarkdown(name)}* — \`$${parseFloat(u.volume || 0).toLocaleString()}\` volume \\(${u.trades || 0} trades\\)\n`;
            rank++;
        }
    } else {
        tradingText += "No trades recorded yet\\.";
    }

    tradingText += "\n💡 Type \`/leaderboard invites\` to see the Invite Leaderboard\\!";

    const keyboard = new InlineKeyboard()
        .text("👥 Show Invite Leaderboard", "show_referral_leaderboard_from_cmd");

    await ctx.reply(tradingText, { parse_mode: "Markdown", reply_markup: keyboard });
});

// ═══════════════════════════════════════════════════════════════
//                     /admin COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("admin", async (ctx) => {
    if (!env.ADMIN_IDS.includes(ctx.from?.id || 0)) {
        await ctx.reply("⛔️ Access Denied. Admins only.");
        return;
    }

    try {
        const stats = await db.getStats();
        const { escrow: escrowSvc } = await import("../services/escrow");
        const relayerUsdc = await escrowSvc.getRelayerBalance(env.USDC_ADDRESS);
        const relayerEth = await escrowSvc.getRelayerBalance();
        const contractFees = await escrowSvc.getContractFees(env.USDC_ADDRESS);

        const keyboard = new InlineKeyboard()
            .text("🔄 Refresh Stats", "admin_stats")
            .row()
            .text("⚖️ View Trades", "admin_trades");

        await ctx.reply(
            [
                "⚙️ *Admin Dashboard*",
                "",
                `Total Users: ${stats.total_users}`,
                `Active Orders: ${stats.active_orders}`,
                `Completed Trades: ${stats.completed_trades}`,
                `Volume: ${formatTokenAmount(stats.total_volume_generic)}`,
                "",
                "💰 *Relayer Wallet*",
                `Address: \`${truncateAddress(env.ADMIN_WALLET_ADDRESS)}\``,
                `Balance: *${relayerUsdc} USDC*`,
                `Gas: *${relayerEth} ETH*`,
                "",
                "🏧 *Escrow Contract*",
                `Collected Fees: *${contractFees} USDC*`,
                "",
                "━━━━━━━━━━━━━━━━",
                "Fees are sent to your wallet automatically upon release."
            ].join("\n"),
            { parse_mode: "Markdown", reply_markup: keyboard }
        );

    } catch (e) {
        console.error("Admin error:", e);
        await ctx.reply("❌ Failed to load admin stats.");
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /bridge COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("bridge", async (_ctx) => {
    // Disabled — no response
});

// ═══════════════════════════════════════════════════════════════
//                     /admin COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("admin", async (ctx) => {
    if (!isAdmin(ctx)) {
        await ctx.reply("⛔ Admin access only.");
        return;
    }

    try {
        const stats = await db.getStats();

        await ctx.reply(
            [
                "🛡️ *Admin Dashboard*",
                "",
                "━━━━ *Platform Stats* ━━━━",
                `👥 Total Users: ${stats.total_users}`,
                `📊 Total Trades: ${stats.total_trades}`,
                `✅ Completed: ${stats.completed_trades}`,
                `📋 Active Orders: ${stats.active_orders}`,
                `💰 Volume: ${formatTokenAmount(stats.total_volume_generic)}`,
                `💸 Fees Collected: ${formatTokenAmount(stats.total_fees_amount)}`,
                `⚠️ Active Disputes: ${stats.active_disputes}`,
                "",
                "━━━━ *Actions* ━━━━",
                "/disputes — View open disputes",
                "/stats — Refresh stats",
                "/broadcast — Send message to all",
            ].join("\n"),
            { parse_mode: "Markdown" }
        );
    } catch (error) {
        await ctx.reply("❌ Failed to load stats. Database may not be configured.");
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /disputes COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("disputes", async (ctx) => {
    if (!isAdmin(ctx)) {
        await ctx.reply("⛔ Admin access only.");
        return;
    }

    try {
        const disputes = await db.getDisputedTrades();

        if (disputes.length === 0) {
            await ctx.reply("✅ No active disputes! 🎉");
            return;
        }

        for (const trade of disputes) {
            const buyer = await db.getUserById(trade.buyer_id);
            const seller = await db.getUserById(trade.seller_id);

            const buyerContact = buyer?.whatsapp_phone
                ? `+${buyer.whatsapp_phone}${buyer.username ? ` (@${buyer.username})` : ""}`
                : (buyer?.username ? `@${buyer.username}` : `ID: ${trade.buyer_id.slice(0, 8)}`);

            const sellerContact = seller?.whatsapp_phone
                ? `+${seller.whatsapp_phone}${seller.username ? ` (@${seller.username})` : ""}`
                : (seller?.username ? `@${seller.username}` : `ID: ${trade.seller_id.slice(0, 8)}`);

            const keyboard = new InlineKeyboard()
                .text("✅ Release to Buyer", `resolve:${trade.id}:buyer`)
                .row()
                .text("🔄 Refund to Seller", `resolve:${trade.id}:seller`);

            await ctx.reply(
                [
                    `⚠️ *Dispute — Trade ${trade.id.slice(0, 8)}*`,
                    "",
                    `Amount: ${formatTokenAmount(trade.amount)}`,
                    `Fiat: ${formatINR(trade.fiat_amount)}`,
                    `Buyer: \`${buyerContact}\``,
                    `Seller: \`${sellerContact}\``,
                    `Status: ${formatTradeStatus(trade.status)}`,
                    `Reason: ${trade.dispute_reason || "Not specified"}`,
                    "",
                    `Created: ${new Date(trade.created_at).toLocaleString()}`,
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
        }
    } catch (error) {
        await ctx.reply("❌ Failed to load disputes.");
    }
});

// ═══════════════════════════════════════════════════════════════
//              CALLBACK QUERY HANDLERS
// ═══════════════════════════════════════════════════════════════

bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!ctx.from) return;
    console.log(`[CALLBACK] Received: ${data} from user ${ctx.from.id} (@${ctx.from.username || "anon"})`);

    // Ensure all callbacks are answered eventually (default fallback if not handled)
    let handled = false;

    // Monitor all callbacks
    console.log(`[CQ] Data: ${data}`);

    // Wrap the entire handler in a try/catch to prevent global crashes
    try {

        // Handle "refresh_referrals"
        if (data === "refresh_referrals") {
            const stats = await db.getReferralsByReferrer(ctx.from.id);

            // Check if there are pending referrals that are now in the group
            if (stats.pending > 0 && env.COMMUNITY_CHAT_ID) {
                let updatedSome = false;
                for (const referral of stats.list) {
                    if (referral.status === "pending") {
                        try {
                            const member = await ctx.api.getChatMember(Number(env.COMMUNITY_CHAT_ID), referral.referred_telegram_id);
                            const isMember = ["member", "administrator", "creator", "restricted"].includes(member.status);
                            if (isMember) {
                                await db.updateReferralStatus(referral.referred_telegram_id, "completed");
                                referral.status = "completed";
                                updatedSome = true;

                                // Notify referrer
                                await ctx.api.sendMessage(
                                    referral.referrer_telegram_id,
                                    `🎉 *New Qualified Referral!*\n\nA user you invited has successfully joined the community group! Your referral is now qualified! 🚀`,
                                    { parse_mode: "Markdown" }
                                ).catch(() => { });
                            }
                        } catch (err) {
                            // Ignore
                        }
                    }
                }
                if (updatedSome) {
                    const updatedStats = await db.getReferralsByReferrer(ctx.from.id);
                    stats.total = updatedStats.total;
                    stats.qualified = updatedStats.qualified;
                    stats.pending = updatedStats.pending;
                }
            }

            const botInfo = await getBotInfo();
            const inviteLink = `https://t.me/${botInfo.username}?start=ref_${ctx.from.id}`;
            const shareText = `Hey! Join P2PFather, the most secure P2P Crypto Exchange Bot in Kerala. Trade USDC/USDT instantly using UPI and Bank Transfer! 🚀`;
            const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(shareText)}`;

            const message = [
                "👥 *P2PFather Referral Program*",
                "",
                "Invite friends to trade on *P2PFather* and grow our community together\\!",
                "",
                "📢 *Rules:*",
                "• The referral counts only when your friend joins our community group\\.",
                "",
                "🔗 *Your Personal Invitation Link:*",
                `\`${escapeMarkdown(inviteLink)}\``,
                "",
                "📊 *Your Referral Stats:*",
                `• 👥 *Total Invited:* \`${stats.total}\``,
                `• ✅ *Qualified (Joined Group):* \`${stats.qualified}\``,
                `• ⏳ *Pending (Not Joined):* \`${stats.pending}\``,
            ].join("\n");

            const cacheBusterClaim = `?v=${Date.now()}`;
            const claimUrl = `https://p2pfather.com/miniapp/claim-rewards${cacheBusterClaim}`;

            const keyboard = new InlineKeyboard()
                .url("🔗 Share Invite Link", shareUrl).row()
                .url("📢 Join Community Group", env.COMMUNITY_INVITE_LINK).row()
                .webApp("💰 Claim Rewards", claimUrl).row()
                .text("🔄 Refresh Stats", "refresh_referrals")
                .text("🏆 Invite Leaderboard", "show_referral_leaderboard");

            try {
                await ctx.editMessageText(message, { parse_mode: "Markdown", reply_markup: keyboard });
            } catch (err) {
                // Ignore if content didn't change
            }
            await ctx.answerCallbackQuery({ text: "Stats updated! ✅" });
            return;
        }

        // Handle "show_referral_leaderboard"
        if (data === "show_referral_leaderboard") {
            const dbInstance = (db as any).getClient();
            const { data: referrals, error } = await dbInstance
                .from("referrals")
                .select("referrer_telegram_id, status")
                .eq("status", "completed");

            let leaderboardText = "🏆 *P2PFather Invite Champions*\n\n";

            if (!error && referrals && referrals.length > 0) {
                const counts: Record<number, number> = {};
                for (const ref of referrals) {
                    const id = ref.referrer_telegram_id;
                    counts[id] = (counts[id] || 0) + 1;
                }

                const referrerIds = Object.keys(counts).map(Number);
                const { data: users } = await dbInstance
                    .from("users")
                    .select("telegram_id, username, first_name")
                    .in("telegram_id", referrerIds);

                const list = (users || []).map((u: any) => ({
                    name: u.username ? `@${u.username}` : (u.first_name || "Anonymous"),
                    count: counts[u.telegram_id] || 0
                })).sort((a: any, b: any) => b.count - a.count).slice(0, 10);

                if (list.length > 0) {
                    let rank = 1;
                    for (const item of list) {
                        const rankEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}\\.`;
                        leaderboardText += `${rankEmoji} *${escapeMarkdown(item.name)}* — \`${item.count}\` qualified invites\n`;
                        rank++;
                    }
                } else {
                    leaderboardText += "No qualified referrals yet\\. Share your link to top the board\\!";
                }
            } else {
                leaderboardText += "No qualified referrals yet\\. Share your link to top the board\\!";
            }

            const backKeyboard = new InlineKeyboard()
                .text("🔙 Back to Stats", "refresh_referrals");

            await ctx.editMessageText(leaderboardText, { parse_mode: "Markdown", reply_markup: backKeyboard }).catch(() => { });
            await ctx.answerCallbackQuery();
            return;
        }

        // Handle "show_referral_leaderboard_from_cmd"
        if (data === "show_referral_leaderboard_from_cmd") {
            const dbInstance = (db as any).getClient();
            const { data: referrals, error } = await dbInstance
                .from("referrals")
                .select("referrer_telegram_id, status")
                .eq("status", "completed");

            let leaderboardText = "🏆 *P2PFather Invite Champions*\n\n";

            if (!error && referrals && referrals.length > 0) {
                const counts: Record<number, number> = {};
                for (const ref of referrals) {
                    const id = ref.referrer_telegram_id;
                    counts[id] = (counts[id] || 0) + 1;
                }

                const referrerIds = Object.keys(counts).map(Number);
                const { data: users } = await dbInstance
                    .from("users")
                    .select("telegram_id, username, first_name")
                    .in("telegram_id", referrerIds);

                const list = (users || []).map((u: any) => ({
                    name: u.username ? `@${u.username}` : (u.first_name || "Anonymous"),
                    count: counts[u.telegram_id] || 0
                })).sort((a: any, b: any) => b.count - a.count).slice(0, 20);

                if (list.length > 0) {
                    let rank = 1;
                    for (const item of list) {
                        const rankEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}\\.`;
                        leaderboardText += `${rankEmoji} *${escapeMarkdown(item.name)}* — \`${item.count}\` qualified invites\n`;
                        rank++;
                    }
                } else {
                    leaderboardText += "No qualified referrals yet\\. Share your link with /invite to top the board\\!";
                }
            } else {
                leaderboardText += "No qualified referrals yet\\. Share your link with /invite to top the board\\!";
            }

            const backKeyboard = new InlineKeyboard()
                .text("🔙 Back to Traders", "show_traders_leaderboard_from_cmd");

            await ctx.editMessageText(leaderboardText, { parse_mode: "Markdown", reply_markup: backKeyboard }).catch(() => { });
            await ctx.answerCallbackQuery();
            return;
        }

        // Handle "show_traders_leaderboard_from_cmd"
        if (data === "show_traders_leaderboard_from_cmd") {
            const dbInstance = (db as any).getClient();
            const { data: users, error } = await dbInstance.rpc("get_timeframe_leaderboard", {
                p_days: 0,
                p_limit: 10,
                p_offset: 0
            });

            let tradingText = "🛡️ *P2PFather Top Traders (All Time)*\n\n";

            if (!error && users && users.length > 0) {
                let rank = 1;
                for (const u of users) {
                    const rankEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}\\.`;
                    const name = u.name || "Anonymous";
                    tradingText += `${rankEmoji} *${escapeMarkdown(name)}* — \`$${parseFloat(u.volume || 0).toLocaleString()}\` volume \\(${u.trades || 0} trades\\)\n`;
                    rank++;
                }
            } else {
                tradingText += "No trades recorded yet\\.";
            }

            tradingText += "\n💡 Type \`/leaderboard invites\` to see the Invite Leaderboard\\!";

            const keyboard = new InlineKeyboard()
                .text("👥 Show Invite Leaderboard", "show_referral_leaderboard_from_cmd");

            await ctx.editMessageText(tradingText, { parse_mode: "Markdown", reply_markup: keyboard }).catch(() => { });
            await ctx.answerCallbackQuery();
            return;
        }

        // Handle "verify_referral"
        if (data && data.startsWith("verify_referral:")) {
            const referrerId = parseInt(data.replace("verify_referral:", ""));
            if (env.COMMUNITY_CHAT_ID) {
                try {
                    const member = await ctx.api.getChatMember(Number(env.COMMUNITY_CHAT_ID), ctx.from.id);
                    const isMember = ["member", "administrator", "creator", "restricted"].includes(member.status);
                    if (isMember) {
                        await db.updateReferralStatus(ctx.from.id, "completed");

                        // Notify referrer
                        await ctx.api.sendMessage(
                            referrerId,
                            `🎉 *New Qualified Referral!*\n\n@${escapeMarkdown(ctx.from.username || ctx.from.first_name || "Someone")} has successfully joined the community group! Your referral is now qualified! 🚀`,
                            { parse_mode: "Markdown" }
                        ).catch(() => { });

                        await ctx.answerCallbackQuery({ text: "Verification successful! Welcome! ✅" });

                        // Delete the verify prompt and trigger the start welcome message
                        await ctx.deleteMessage().catch(() => { });

                        // Trigger start flow
                        const user = await ensureUser(ctx);
                        const cacheBuster = `?v=${Date.now()}`;
                        const miniAppUrl = `https://p2pfather.com/miniapp${cacheBuster}`;
                        const welcome = [
                            `👋 *Welcome to the P2PFather Platform*`,
                            "",
                            "Secure, decentralized settlement at your fingertips\\.",
                            "",
                            "🔐 *Your Wallet Address:*",
                            `\`${escapeMarkdown(user.wallet_address || '')}\``,
                            "",
                            "🚀 *Ready to Trade?*",
                            "Open our Mini App to browse ads, manage your portfolio, and list your own offers in a few taps\\!",
                        ].join("\n");

                        const startKeyboard = new InlineKeyboard()
                            .webApp("🚀 Launch P2PFather App", miniAppUrl).row()
                            .text("📊 Browse Live Ads", "ads:all")
                            .text("👤 My Profile", "view_profile").row()
                            .text("💼 My Wallet & Vault", "view_wallet")
                            .url("📚 User Guide & Help", "https://p2pfather.com/guide");

                        const bannerPath = path.join(process.cwd(), "assets/bot_logo.jpg");
                        await ctx.replyWithPhoto(new InputFile(bannerPath), {
                            caption: welcome,
                            parse_mode: "Markdown",
                            reply_markup: startKeyboard
                        });
                        return;
                    } else {
                        await ctx.answerCallbackQuery({ text: "⚠️ You haven't joined the group yet!", show_alert: true });
                    }
                } catch (e) {
                    await ctx.answerCallbackQuery({ text: "⚠️ Verification error. Make sure bot is in the group.", show_alert: true });
                }
            } else {
                await ctx.answerCallbackQuery({ text: "⚠️ Community group is not configured by admin.", show_alert: true });
            }
            return;
        }

        // Handle "I want to SELL/BUY" from /newad
        // Handle "I want to SELL/BUY" from /newad
        if (data === "newad:sell" || data === "newad:buy") {
            const miniAppUrl = "https://p2pfather.com/miniapp/create";
            const keyboard = new InlineKeyboard()
                .webApp("📱 Create Ad in Mini App", miniAppUrl);

            await ctx.editMessageText(
                [
                    "📢 *Create a New Ad*",
                    "",
                    "We've moved ad creation to our Mini App for a faster and more secure experience! 🚀",
                    "",
                    "Tap below to get started:",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
            await ctx.answerCallbackQuery();
            return;
        }

        // Handle "View Profile"
        if (data === "view_profile") {
            const user = await ensureUser(ctx);
            const stars = (user.trust_score ?? 0) >= 95 ? "💎" :
                (user.trust_score ?? 0) >= 80 ? "⭐" :
                    (user.trust_score ?? 0) >= 60 ? "🟢" :
                        (user.trust_score ?? 0) >= 30 ? "🟡" : "🔴";

            await ctx.reply(
                [
                    "👤 *Your Profile*",
                    "",
                    `Name: ${user.first_name || "Anonymous"}`,
                    `Tier: ${user.tier.toUpperCase()}`,
                    "",
                    `${stars} Trust: ${user.trust_score}%`,
                    `📈 Total Trades: ${user.trade_count}`,
                    `✅ Completed: ${user.completed_trades}`,
                    "",
                    `💳 Wallet: \`${user.wallet_address ? truncateAddress(user.wallet_address) : "Not set"}\``,
                    `📱 UPI: ${user.upi_id || "Not set"}`,
                ].join("\n"),
                { parse_mode: "Markdown" }
            );
            await ctx.answerCallbackQuery();
            return;
        }

        // Handle "View Wallet"
        if (data === "view_wallet") {
            const user = await ensureUser(ctx);
            const keyboard = new InlineKeyboard()
                .text("📋 Copy Address", `copy:${user.wallet_address}`)
                .row()
                .text("🔑 Export Private Key", "export_key")
                .row()
                .text("📱 Set UPI", "change_upi");

            await ctx.reply(
                [
                    "🔑 *Your Wallet*",
                    "",
                    `💳 Address: \`${user.wallet_address}\``,
                    `📱 UPI: ${user.upi_id || "Not set"}`,
                    "",
                    "Your wallet was created automatically.",
                    "You OWN this wallet — export your key anytime!",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
            await ctx.answerCallbackQuery();
            return;
        }

        // Handle "Back" to Start
        if (data === "start_over") {
            const user = await ensureUser(ctx);
            const welcome = [
                `👋 *Welcome to the P2PFather Platform*`,
                "",
                "Secure, decentralized settlement at your fingertips.",
                "",
                "🔐 *Your Wallet Address:*",
                `\`${user.wallet_address}\``,
                "",
                "🚀 **Ready to Trade?**",
                "Open our Mini App to browse ads, manage your portfolio, and list your own offers in a few taps!",
            ].join("\n");

            const cacheBuster = `?v=${Date.now()}`;
            const miniAppUrl = `https://p2pfather.com/miniapp${cacheBuster}`;
            const startKeyboard = new InlineKeyboard()
                .webApp("🚀 Launch P2PFather App", miniAppUrl).row()
                .text("📊 Browse Live Ads", "ads:all")
                .text("👤 My Profile", "view_profile").row()
                .text("💼 My Wallet & Vault", "view_wallet")
                .url("📚 User Guide & Help", "https://p2pfather.com/guide");

            await ctx.editMessageText(welcome, { parse_mode: "Markdown", reply_markup: startKeyboard });
            await ctx.answerCallbackQuery();
        }

        // Handle Token Selection -> Ask Amount
        if (data.startsWith("newad_token:")) {
            const token = data.replace("newad_token:", "");
            const draft = ctx.session.ad_draft;

            if (!draft || !draft.type) {
                await ctx.answerCallbackQuery({ text: "Session expired. Start over." });
                return;
            }

            draft.token = token;
            ctx.session.awaiting_input = `ad_amount_${draft.type}`;

            const minAmount = 1;

            await ctx.editMessageText(
                [
                    `📢 *Create ${escapeMarkdown(draft.type.toUpperCase())} Ad — Step 2/3*`,
                    "",
                    `Selected: *${escapeMarkdown(token)}* ✅`,
                    "",
                    `How much ${escapeMarkdown(token)} do you want to ${escapeMarkdown(draft.type)}?`,
                    "",
                    `Minimum: *${escapeMarkdown(String(minAmount))} ${escapeMarkdown(token)}*`,
                    "",
                    "Send the amount (e.g., \`100\` or \`50.5\`):",
                ].join("\n"),
                { parse_mode: "Markdown" }
            );
            await ctx.answerCallbackQuery();
            handled = true;
        }



        // Handle Send Token Selection -> Ask Address
        if (data.startsWith("send_token:")) {
            const token = data.replace("send_token:", "");
            const tokenAddress = token === "ETH" ? "native" : (token === "USDT" ? env.USDT_ADDRESS : env.USDC_ADDRESS);

            ctx.session.send_draft = { token, token_address: tokenAddress };
            ctx.session.awaiting_input = "send_to_address";

            await ctx.editMessageText(
                [
                    "💸 *Send Crypto — Step 1/3*",
                    "",
                    `Token: *${escapeMarkdown(token)}*`,
                    "",
                    "Please send the *destination wallet address* (Base network):",
                    "",
                    "_Example: 0x123..._",
                ].join("\n"),
                { parse_mode: "Markdown" }
            );
            await ctx.answerCallbackQuery();
        }

        // Handle "Create New Ad" button — redirect to miniapp
        if (data === "newad_start") {
            const miniAppUrl = "https://p2pfather.com/miniapp/create";
            const keyboard = new InlineKeyboard()
                .webApp("📱 Create Ad in Mini App", miniAppUrl);

            await ctx.editMessageText(
                [
                    "📢 *Create a New Ad*",
                    "",
                    "Use our Mini App for the best experience\\! 🚀",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
            await ctx.answerCallbackQuery();
        }

        // ─────── AD BROWSING HANDLERS ───────

        // Browse sell/buy/all ads
        if (data.startsWith("ads:sell") || data.startsWith("ads:buy") || data.startsWith("ads:all")) {
            const parts = data.split(":");
            const filterKey = parts[1]; // sell, buy, all
            const filterType = filterKey === "all" ? undefined : filterKey;
            const label = filterKey === "sell" ? "Sell" : filterKey === "buy" ? "Buy" : "All";
            const page = parseInt(parts[2] || "0");
            const PAGE_SIZE = 6;

            try {
                // Fetch more than needed to know if there's a next page
                const allOrders = await db.getActiveOrders(filterType, undefined, 100);

                if (allOrders.length === 0) {
                    await safeEditMessage(ctx,
                        [
                            `🌟 *Market is Quiet* 🌟`,
                            "",
                            `There are no active ${escapeMarkdown(label).toLowerCase()} ads right now\\.`,
                            "",
                            "✨ Be the first to list an ad and set your own price\\! 🚀",
                        ].join("\n"),
                        {
                            parse_mode: "Markdown",
                            reply_markup: ctx.chat?.type === "private"
                                ? new InlineKeyboard().webApp("✨ Create Ad", "https://p2pfather.com/miniapp/create")
                                : new InlineKeyboard().url("✨ Create Ad", `https://t.me/${ctx.me.username}?start=newad_${ctx.chat?.id || ''}`)
                        }
                    );
                    await ctx.answerCallbackQuery();
                    return;
                }

                const totalPages = Math.ceil(allOrders.length / PAGE_SIZE);
                const startIdx = page * PAGE_SIZE;
                const orders = allOrders.slice(startIdx, startIdx + PAGE_SIZE);

                const header = [
                    "╭─────────────────────────────╮",
                    "│  🏦 P2P FATHER · LIVE ORDERS │",
                    "╰─────────────────────────────╯",
                ].join("\n");

                const adList = orders.map((o) => formatOrder(o)).join("\n\n");

                const keyboard = new InlineKeyboard();
                // Create inline buttons for ads on this page
                orders.forEach((o) => {
                    const totalAvailable = o.amount - (o.filled_amount || 0);
                    const sellable = totalAvailable * 0.995;
                    const action = o.type === "sell" ? "Buy" : "Sell";
                    keyboard.text(
                        `${action} ${formatTokenAmount(sellable, o.token)} @ ${formatINR(o.rate)}`,
                        `trade_ad:${o.id}`
                    ).row();
                });

                // Pagination buttons
                const navRow: Array<{ text: string; data: string }> = [];
                if (page > 0) {
                    navRow.push({ text: "◀️ Previous", data: `ads:${filterKey}:${page - 1}` });
                }
                if (page < totalPages - 1) {
                    navRow.push({ text: "Next ▶️", data: `ads:${filterKey}:${page + 1}` });
                }
                if (navRow.length > 0) {
                    navRow.forEach(b => keyboard.text(b.text, b.data));
                    keyboard.row();
                }
                keyboard.text("🔄 Refresh", `ads:${filterKey}:${page}`).text("⬅️ Back", "ads_back");

                await safeEditMessage(ctx,
                    [
                        `📢 <b>Live ${escapeHTML(label)} Ads</b>`,
                        `   <i>${escapeHTML(String(allOrders.length))} ads  •  Page ${escapeHTML(String(page + 1))}/${escapeHTML(String(totalPages))}</i>`,
                        "",
                        adList,
                        "",
                        "━━━━━━━━━━━━━━━━━━━",
                        "Tap an ad below to start a trade:",
                    ].join("\n"),
                    { parse_mode: "HTML", reply_markup: keyboard }
                );
            } catch (error) {
                await safeEditMessage(ctx, "❌ Failed to load ads. Database may not be configured.");
            }
            await ctx.answerCallbackQuery();
        }

        // Back to ad categories
        if (data === "ads_back") {
            const keyboard = new InlineKeyboard()
                .text("🔴 Sell Ads", "ads:sell")
                .text("🟢 Buy Ads", "ads:buy")
                .row()
                .text("📊 All Ads", "ads:all");

            await ctx.editMessageText(
                [
                    "📢 *Live P2P Ads*",
                    "",
                    "Select a category:",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
            await ctx.answerCallbackQuery();
        }

        // Handle clicking on a specific ad to initiate trade
        if (data.startsWith("trade_ad:")) {
            const orderId = data.replace("trade_ad:", "");
            const user = await ensureUser(ctx);
            const order = await db.getOrderById(orderId);

            if (!order || order.status !== "active") {
                await ctx.answerCallbackQuery({ text: "This ad is no longer available!" });
                return;
            }

            if (order.user_id === user.id) {
                await ctx.answerCallbackQuery({ text: "This is your own ad!" });
                return;
            }

            const seller = await db.getUserById(order.user_id);
            const isWaMerchant = Boolean(
                order.source === "whatsapp" ||
                seller?.preferred_channel === "whatsapp" ||
                (seller?.whatsapp_phone && !seller?.telegram_id)
            );

            if (isWaMerchant) {
                const waBotPhone = env.WA_BOT_NUMBER || "917012751478";
                const keyboard = new InlineKeyboard()
                    .url("💬 Trade via WhatsApp Bot", `https://wa.me/${waBotPhone}?text=trade_ad_${order.id}`)
                    .row()
                    .url("🌐 Open Web Dashboard", "https://p2pfather.com/webapp")
                    .row()
                    .text("🔙 Back to Market", "market");

                await ctx.editMessageText(
                    `💬 *WhatsApp Merchant Ad*\n\nThis ad was posted by a verified WhatsApp merchant (${escapeMarkdown(seller?.first_name || "Merchant")}).\n\nTo trade safely with this merchant, please open the trade in WhatsApp or on the Web Dashboard:`,
                    { parse_mode: "Markdown", reply_markup: keyboard }
                );
                await ctx.answerCallbackQuery();
                return;
            }

            const totalAvailable = order.amount - (order.filled_amount || 0);
            const sellable = totalAvailable * 0.995;
            const buyerFee = totalAvailable * 0.005;
            const buyerReceives = totalAvailable * 0.99;
            const action = order.type === "sell" ? "BUY from" : "SELL to";

            const keyboard = new InlineKeyboard()
                .text("✅ Start Trade", `confirm_trade:${orderId}`)
                .text("❌ Cancel", `cancel_action:${user.id}`);

            await ctx.editMessageText(
                [
                    `🤝 *${escapeMarkdown(action)} this trader?*`,
                    "",
                    `Amount: *${escapeMarkdown(formatTokenAmount(sellable, order.token))}*`,
                    `Rate: *${escapeMarkdown(formatINR(order.rate))}/${escapeMarkdown(order.token)}*`,
                    `Total Fiat: *${escapeMarkdown(formatINR(sellable * order.rate))}*`,
                    "",
                    `⚖️ *Symmetry Fee Split (1%)*:`,
                    `• Your Fee (${(env.FEE_PERCENTAGE * 50).toFixed(1)}%): ${escapeMarkdown(formatTokenAmount(buyerFee, order.token))}`,
                    `• You Receive: *${escapeMarkdown(formatTokenAmount(buyerReceives, order.token))}*`,
                    "",
                    `Payment: ${escapeMarkdown(order.payment_methods?.join(", ") || "UPI")}`,
                    `Trader: ${order.username ? "@" + escapeMarkdown(order.username) : "anon"} (⭐ ${escapeMarkdown(String(order.trust_score ?? 0))}%)`,
                    (order as any).upi_id ? `📱 UPI: ${escapeMarkdown((order as any).upi_id)}` : "",
                    "",
                    order.type === "sell"
                        ? "⚠️ Seller deposits USDC to escrow → You send fiat → Crypto released to you"
                        : "⚠️ You deposit USDC to escrow → Buyer sends fiat → You confirm → Crypto released",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
            await ctx.answerCallbackQuery();
        }

        // ─────── AI INTENT CALLBACKS (Missing Handlers) ───────



        // ─────── AD PAYMENT METHOD SELECTION (Final Step) ───────



        // Confirm Send Transaction
        if (data === "confirm_send") {
            const draft = ctx.session.send_draft;
            const user = await ensureUser(ctx);

            if (!draft || !draft.to_address || !draft.amount || !draft.token) {
                await ctx.answerCallbackQuery({ text: "Session expired. Start over." });
                return;
            }

            await ctx.editMessageText("⏳ Sending tokens on blockchain...");

            try {
                const txHash = draft.token === "ETH"
                    ? await wallet.sendNative(user.wallet_index, draft.to_address, draft.amount.toString()) // Ensure string
                    : await wallet.sendToken(
                        user.wallet_index,
                        draft.to_address || "",
                        draft.amount.toString(),
                        draft.token_address || ""
                    );

                ctx.session.send_draft = undefined;

                await ctx.editMessageText(
                    [
                        "✅ *Tokens Sent\\!* 🚀",
                        "",
                        `Amount: *${escapeMarkdown(String(draft.amount))} ${escapeMarkdown(draft.token)}*`,
                        `To: \`${escapeMarkdown(draft.to_address)}\``,
                        "",
                        `🔗 [View on BaseScan](${getExplorerUrl(txHash)})`,
                    ].join("\n"),
                    { parse_mode: "Markdown" }
                );
            } catch (error) {
                console.error("Send error:", error);
                await ctx.editMessageText("❌ Translation failed on blockchain. Please try again.");
            }
            await ctx.answerCallbackQuery();
        }


        // Unified Cancel/Delete Handler (Handles refunds for Sell ads)
        if (data.startsWith("ad_cancel_unlock:") || data.startsWith("ad_delete:")) {
            const orderId = data.replace(/ad_cancel_unlock:|ad_delete:/, "");
            const user = await ensureUser(ctx);
            const order = await db.getOrderById(orderId);

            if (!order || order.status === "cancelled") {
                await ctx.answerCallbackQuery({ text: "Order not active!" });
                return;
            }

            if (order.user_id !== user.id) {
                await ctx.answerCallbackQuery({ text: "Not your ad!" });
                return;
            }

            // Handle Refunds for Sell Ads
            if ((order.status === "active" || order.status === "paused") && order.type === "sell") {
                await ctx.editMessageText("⏳ Unlocking funds & refunding...");
                try {
                    await db.cancelOrder(orderId); // Mark cancelled FIRST
                    const refundTx = await wallet.adminTransfer(user.wallet_address!, order.amount.toString(), order.token === 'USDT' ? env.USDT_ADDRESS : env.USDC_ADDRESS);

                    await ctx.editMessageText(
                        [
                            "✅ *Ad Cancelled & Funds Unlocked*",
                            "",
                            `Refunded: *${escapeMarkdown(formatTokenAmount(order.amount))}*`,
                            `To: \`${escapeMarkdown(truncateAddress(user.wallet_address!))}\``,
                            "",
                            `🔗 [View Refund Tx](${getExplorerUrl(refundTx)})`,
                        ].join("\n"),
                        { parse_mode: "Markdown" }
                    );
                } catch (error) {
                    console.error("Refund failed:", error);
                    await ctx.editMessageText("❌ Refund failed! Please contact support.");
                }
            } else {
                // Just cancel (Buy ads or already refunded)
                await db.cancelOrder(orderId);
                await ctx.editMessageText("🗑️ Ad deleted.");
            }
            await ctx.answerCallbackQuery();
        }

        // Pause Ad
        if (data.startsWith("ad_pause:")) {
            const orderId = data.replace("ad_pause:", "");
            await db.updateOrder(orderId, { status: "paused" });
            await ctx.answerCallbackQuery({ text: "Ad paused" });
            const keyboard = new InlineKeyboard()
                .text("▶️ Resume Ad", `ad_resume:${orderId}`)
                .text("🗑️ Delete Ad", `ad_delete:${orderId}`);
            await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
        }

        // Resume Ad
        if (data.startsWith("ad_resume:")) {
            const orderId = data.replace("ad_resume:", "");
            await db.updateOrder(orderId, { status: "active" });
            await ctx.answerCallbackQuery({ text: "Ad resumed" });
            const keyboard = new InlineKeyboard()
                .text("⏸️ Pause Ad", `ad_pause:${orderId}`)
                .text("🗑️ Delete Ad", `ad_delete:${orderId}`);
            await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
        }

        // Confirm Trade (Start Trade)
        if (data.startsWith("confirm_trade:")) {
            const orderId = data.replace("confirm_trade:", "");
            const user = await ensureUser(ctx);
            const order = await db.getOrderById(orderId);

            if (!order || order.status !== "active") {
                await ctx.answerCallbackQuery({ text: "Order no longer active!" });
                return;
            }

            // Prevent trading with self
            if (order.user_id === user.id) {
                await ctx.answerCallbackQuery({ text: "You can't trade with yourself!" });
                return;
            }

            try {
                if (order.type === "sell") {
                    await ctx.editMessageText("⏳ Initiating trade... checking seller balance.");

                    // 1. Double check seller still has the tokens in their bot wallet (Safety against drains)
                    // NOTE: For Sell Ads, funds were already moved to the relayer during creation. 
                    // The check below is only needed if we support "Direct" ads where funds are not pre-escrowed.
                    // For now, in P2PKerala, sell ads are pre-funded.
                    const seller = await db.getUserById(order.user_id);
                    if (!seller || !seller.wallet_address) throw new Error("Seller wallet not found.");

                    // 2. Atomic fill check (Race condition protection)
                    const filled = await db.fillOrder(order.id, order.amount);
                    if (!filled) {
                        await ctx.editMessageText("❌ Trade failed: Someone else just matched this ad.");
                        return;
                    }

                    await ctx.editMessageText("⏳ Locking crypto in escrow contract...");

                    const tokenSymbol = order.token || "USDT";
                    const tokenAddress = await escrow.resolveTokenAddressForTrade(
                        seller.wallet_address!,
                        tokenSymbol,
                        order.amount,
                        order.chain as any
                    );

                    const vaultBalance = await escrow.getVaultBalance(seller.wallet_address!, tokenAddress, order.chain as any);
                    if (parseFloat(vaultBalance) < order.amount) {
                        await db.revertFillOrder(order.id, order.amount);
                        await ctx.editMessageText(
                            `❌ *Trade Failed*\n\nThe Seller does not have enough crypto locked in their Escrow Vault.\nPlease try another ad.`,
                            { parse_mode: "Markdown" }
                        );
                        
                        // Notify Seller that they missed a trade
                        if (seller.telegram_id) {
                            await ctx.api.sendMessage(
                                seller.telegram_id,
                                `⚠️ *MISSED TRADE\\!*\n\nA buyer tried to match your ${escapeMarkdown(formatTokenAmount(order.amount, tokenSymbol))} ad, but you don't have enough balance locked in your Escrow Vault\\.\n\nPlease deposit funds to your Vault via the Mini App to keep your ads active\\.`,
                                { parse_mode: "Markdown" }
                            );
                        }
                        return;
                    }

                    await ctx.editMessageText("⏳ Locking crypto in escrow contract...");

                    try {
                        // 3. Relayer creates trade on Smart Contract
                        // Contract takes 1% (FEE_BPS=100) on release.
                        const tradeId = await escrow.createRelayedTrade(
                            seller.wallet_address!,
                            user.wallet_address!,
                            tokenAddress,
                            order.amount.toString(),
                            1800
                        );
                        // Old relayerCreateTrade returned { txHash, tradeId }, new one returns tradeId string
                        const txHash = "pending"; // We don't get hash easily from createRelayedTrade wrapper unless modified, but it logs it. 
                        // Actually createRelayedTrade returns tradeId. 
                        // To get hash we might need to modify service or just say "pending"
                        // For now let's assume we can live without hash or I should fix service to return both.
                        // I'll update service later if needed.

                        // 4. Create local Trade record
                        const feePercent = env.getFeePercentage(order.chain);
                        const trade = await db.createTrade({
                            order_id: order.id,
                            buyer_id: user.id,
                            seller_id: order.user_id,
                            token: tokenSymbol,
                            chain: order.chain || "base",
                            amount: order.amount,
                            rate: order.rate,
                            fiat_amount: order.amount * order.rate * (1 - (feePercent / 2)),
                            fiat_currency: "INR",
                            fee_amount: order.amount * feePercent,
                            fee_percentage: feePercent,
                            buyer_receives: order.amount * (1 - feePercent),
                            payment_method: "UPI",
                            status: "in_escrow",
                            on_chain_trade_id: Number(tradeId),
                            escrow_tx_hash: txHash,
                            created_at: new Date().toISOString(),
                        });

                        await ctx.editMessageText(
                            `✅ Trade Started! Trade #${tradeId}\nCheck /mytrades to proceed with payment.`
                        );

                        // Notify Seller
                        if (seller.telegram_id) {
                            await ctx.api.sendMessage(
                                seller.telegram_id,
                                `🔔 *New Trade Started\\!*\\n\\nBuyer matches your ad for ${escapeMarkdown(formatTokenAmount(order.amount, order.token))}\\.\\nThey will send payment soon\\.\\n\\nCheck /mytrades to monitor status\\.`,
                                { parse_mode: "Markdown" }
                            );
                        }

                        // Update the Telegram broadcast message live status to locked
                        const orderUser = await db.getUserById(order.user_id);
                        if (orderUser) {
                            updateAdBroadcasts(order, orderUser, "locked").catch(console.error);
                        }
                    } catch (blockchainError: any) {
                        console.error("Blockchain error during trade creation:", blockchainError);
                        // Critical: Revert the fill so the ad remains active!
                        await db.revertFillOrder(order.id, order.amount);
                        await ctx.editMessageText(`❌ Trade initiation failed: ${blockchainError.message || "Blockchain error"}. Ad has been restored to active.`);
                    }
                } else {
                    // ═══ TAKER IS SELLING (Filling a Buy Order) ═══
                    await ctx.editMessageText("⏳ Initiating trade...");

                    const seller = user; // The one clicking the button (Taker)
                    const tokenSymbol = order.token || "USDC";
                    const tokenAddress = tokenSymbol === "USDT" ? env.USDT_ADDRESS : env.USDC_ADDRESS;

                    // 1. Check Seller's Vault Balance
                    const vaultBalance = await escrow.getVaultBalance(seller.wallet_address!, tokenAddress);
                    const totalRequired = order.amount;
                    
                    if (parseFloat(vaultBalance) < totalRequired) {
                        await ctx.editMessageText(
                            `❌ *Insufficient ${tokenSymbol} Vault Balance*\n\nYou need *${escapeMarkdown(formatTokenAmount(totalRequired, tokenSymbol))}* locked in your Escrow Vault but have *${escapeMarkdown(formatTokenAmount(parseFloat(vaultBalance), tokenSymbol))}*.\n\nPlease open the Mini App or type /wallet to deposit funds to your Vault first.`,
                            { parse_mode: "Markdown" }
                        );
                        return;
                    }

                    await ctx.editMessageText(`⏳ Locking ${tokenSymbol} in escrow...`);

                    try {
                        // 2. Relayer creates Trade on Smart Contract
                        const buyerUser = await db.getUserById(order.user_id);

                        const { txHash, tradeId } = {
                            txHash: "pending", tradeId: await escrow.createRelayedTrade(
                                seller.wallet_address!, // Seller
                                buyerUser!.wallet_address!, // Buyer
                                tokenAddress,
                                order.amount.toString(),
                                1800
                            )
                        };

                        // 4. Create Trade Record
                        const feePercent = env.getFeePercentage(order.chain);
                        const trade = await db.createTrade({
                            order_id: order.id,
                            buyer_id: order.user_id, // Maker (Buyer)
                            seller_id: seller.id,    // Taker (Seller)
                            token: tokenSymbol,
                            chain: order.chain || "base",
                            amount: order.amount,
                            rate: order.rate,
                            fiat_amount: order.amount * order.rate * (1 - (feePercent / 2)),
                            fiat_currency: "INR",
                            fee_amount: order.amount * feePercent,
                            fee_percentage: feePercent,
                            buyer_receives: order.amount * (1 - feePercent),
                            payment_method: "UPI",
                            status: "in_escrow",
                            on_chain_trade_id: Number(tradeId),
                            escrow_tx_hash: txHash,
                            created_at: new Date().toISOString(),
                        });

                        // 5. Mark Order as Filled
                        await db.updateOrder(order.id, { status: "filled", filled_amount: order.amount });

                        await ctx.editMessageText(
                            `✅ Trade Started! Trade #${tradeId}\nWaiting for Buyer to pay.\nCheck /mytrades.`
                        );

                        // Notify Buyer (Maker)
                        if (buyerUser && buyerUser.telegram_id) {
                            await ctx.api.sendMessage(
                                buyerUser.telegram_id,
                                `🔔 *Trade Started!* 🟢\n\nSeller matched your Buy Ad for ${escapeMarkdown(formatTokenAmount(order.amount, tokenSymbol))}.\nCrypto is locked in escrow.\n\n👇 *Pay Now via UPI*`,
                                { parse_mode: "Markdown" }
                            );
                        }

                        // Update the Telegram broadcast message live status to locked
                        const orderUser = await db.getUserById(order.user_id);
                        if (orderUser) {
                            updateAdBroadcasts(order, orderUser, "locked").catch(console.error);
                        }
                    } catch (blockchainError: any) {
                        console.error("Sell trade initiation failed:", blockchainError);
                        await ctx.editMessageText(`❌ Trade initiation failed: ${blockchainError.message || "Blockchain error"}.\n\n⚠️ If funds were already sent to the relayer, please contact support with this info.`);
                        // We don't mark as filled here, so the Buy ad remains active.
                    }
                }
            } catch (e) {
                console.error("Trade creation failed:", e);
                await ctx.editMessageText("❌ Failed to start trade. Blockchain error.");
            }
        }

        // Handle buy button (legacy)
        if (data.startsWith("buy:")) {
            const orderId = data.replace("buy:", "");
            const user = await ensureUser(ctx);
            const order = await db.getOrderById(orderId);

            if (!order || order.status !== "active") {
                await ctx.answerCallbackQuery({ text: "Order no longer available!" });
                return;
            }

            if (order.user_id === user.id) {
                await ctx.answerCallbackQuery({ text: "You can't buy your own order!" });
                return;
            }

            // Show trade confirmation
            const available = order.amount - order.filled_amount;
            const feePercent = env.getFeePercentage(order.chain);
            const feeAmount = available * feePercent;
            const buyerReceives = available - feeAmount;

            const keyboard = new InlineKeyboard()
                .text("✅ Confirm Trade", `confirm_trade:${orderId}`)
                .text("❌ Cancel", "cancel_action");

            await ctx.editMessageText(
                [
                    "🤝 *Confirm Trade*",
                    "",
                    `Amount: ${escapeMarkdown(formatTokenAmount(available, order.token))}`,
                    `Rate: ${escapeMarkdown(formatINR(order.rate))}/${escapeMarkdown(order.token)}`,
                    `Total Fiat: ${escapeMarkdown(formatINR(available * order.rate))}`,
                    `Fee (${(feePercent * 50).toFixed(1)}%): ${escapeMarkdown(formatTokenAmount(feeAmount, order.token))}`,
                    `You receive: ${escapeMarkdown(formatTokenAmount(buyerReceives, order.token))}`,
                    "",
                    `Payment: ${escapeMarkdown(order.payment_methods.join(", "))}`,
                    `Seller: @${escapeMarkdown(order.username || "anon")}`,
                    "",
                    "⚠️ After confirming, seller will deposit USDC to escrow.",
                    "You'll then send fiat via the specified payment method.",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );

            await ctx.answerCallbackQuery();
        }

        // ─────── TRADE MANAGEMENT HANDLERS ───────

        // View Trade Details
        if (data.startsWith("trade_view:")) {
            const tradeId = data.replace("trade_view:", "");
            const user = await ensureUser(ctx);
            const trade = await db.getTradeById(tradeId);

            if (!trade) {
                await ctx.answerCallbackQuery({ text: "Trade not found!" });
                return;
            }

            const isBuyer = trade.buyer_id === user.id;
            const isSeller = trade.seller_id === user.id;
            const partnerId = isBuyer ? trade.seller_id : trade.buyer_id;
            const [partner, order] = await Promise.all([
                db.getUserById(partnerId),
                db.getOrderById(trade.order_id)
            ]);

            const statusDescriptions: any = {
                'in_escrow': isBuyer ? "🟡 Pay the seller now!" : "🟡 Waiting for buyer payment...",
                'fiat_sent': isBuyer ? "🔵 You marked paid. Waiting for release." : "🔵 Buyer marked paid. Please check bank & Release.",
                'completed': "✅ Trade Completed.",
                'disputed': "🔴 Disputed. Admin will review."
            };

            const details = [
                `💰 *Trade #${escapeMarkdown(trade.on_chain_trade_id?.toString() || trade.id.slice(0, 4))}*`,
                "",
                `Role: ${isBuyer ? "🟢 Buyer" : "🔴 Seller"}`,
                `Status: *${escapeMarkdown(trade.status.toUpperCase())}*`,
                `ℹ️ ${escapeMarkdown(statusDescriptions[trade.status] || "")}`,
                "",
                `Amount: *${escapeMarkdown(formatTokenAmount(trade.amount, trade.token))}*`,
                `Fiat: *${escapeMarkdown(formatINR(trade.fiat_amount))}*`,
                `Rate: ${escapeMarkdown(formatINR(trade.rate))}/${escapeMarkdown(trade.token)}`,
                "",
                `⚖️ Fee Split (1%):`,
                isSeller
                    ? `🔐 You Locked: *${escapeMarkdown(formatTokenAmount(trade.amount, trade.token))}*`
                    : `🔐 Seller Locked: *${escapeMarkdown(formatTokenAmount(trade.amount, trade.token))}*`,
                isBuyer
                    ? `📥 You Receive: *${escapeMarkdown(formatTokenAmount(trade.amount * 0.99, trade.token))}*`
                    : `📥 Buyer Receives: *${escapeMarkdown(formatTokenAmount(trade.amount * 0.99, trade.token))}*`,
                "",
                `Partner: ${partner?.username ? "@" + escapeMarkdown(partner.username.replace(/_/g, "\\_")) : "anon"}`,
                `Payment Method: ${escapeMarkdown(trade.payment_method)}`,
            ];

            // If user is buyer, show seller's payment details
            if (isBuyer && trade.payment_method === "UPI") {
                // Priority: Order details -> Partner profile
                const upiFromOrder = (order?.payment_details as any)?.upi;
                const upiId = upiFromOrder || partner?.upi_id;

                if (upiId) {
                    details.push(`💳 Seller UPI: \`${escapeMarkdown(upiId)}\``);
                } else {
                    details.push("⚠️ Seller hasn't shared UPI in profile.");
                }
            }

            details.push("", "━━━━━━━━━━━━━━━━━━━");

            const keyboard = new InlineKeyboard();

            // Buyer Actions
            if (isBuyer && trade.status === "in_escrow") {
                details.push("👇 *Action Required:* Send fiat to seller, then click 'I Have Paid'.\n\n⚠️ *WARNING:* You MUST click 'I Have Paid' before the 30-minute timer expires! If you send money but forget to click the button, the trade will cancel and you will lose your money.");
                keyboard.text("✅ I Have Paid", `trade_pay:${trade.id}`).row();
                keyboard.text("❌ Cancel Trade", `trade_cancel:${trade.id}`).row();
            }

            // Seller Actions
            if (isSeller && trade.status === "fiat_sent") {
                details.push("👇 *Action Required:* Check your bank. If received, Release Crypto.");
                keyboard.text("🔓 Release Crypto", `trade_release:${trade.id}`).row();
                keyboard.text("⚠️ Dispute (Not Received)", `trade_dispute:${trade.id}`).row();
            }

            // Navigation
            keyboard.text("🔙 Back to Trades", "mytrades_view"); // Re-trigger /mytrades logic? No, better separate handler.
            // Actually I'll use text list for now as handler isn't registered for text command but I can use same logic.

            await ctx.editMessageText(details.join("\n"), {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });
            await ctx.answerCallbackQuery();
        }

        // Buyer Marks Paid
        if (data.startsWith("trade_pay:")) {
            const tradeId = data.replace("trade_pay:", "");
            const trade = await db.getTradeById(tradeId);
            if (!trade) return;

            await db.updateTrade(tradeId, { status: "fiat_sent" });

            // SYNC ON-CHAIN if it's a contract trade
            if (trade.on_chain_trade_id) {
                try {
                    console.log(`[BOT] Syncing fiat payment for trade ${trade.on_chain_trade_id} on-chain...`);
                    await escrow.markFiatSent(trade.on_chain_trade_id, trade.chain as any);
                } catch (err: any) {
                    console.error(`[BOT] Failed to sync fiat status on-chain for trade ${trade.on_chain_trade_id}:`, err.message);
                }
            }

            await ctx.answerCallbackQuery({ text: "Marked as Paid! Seller notified." });

            const keyboard = new InlineKeyboard().text("👁️ Refresh Details", `trade_view:${tradeId}`);
            await ctx.editMessageText("✅ You marked this trade as PAID. Waiting for seller to release.", { reply_markup: keyboard });

            // Notify Seller
            const seller = await db.getUserById(trade.seller_id);
            if (seller && seller.telegram_id) {
                await ctx.api.sendMessage(
                    seller.telegram_id,
                    `💰 *Payment Marked as Sent!*\n\nBuyer says they have paid for Trade #${trade.on_chain_trade_id}.\n\nPlease check your bank account.\nIf received, click Release in /mytrades.`,
                    { parse_mode: "Markdown" }
                );
            }
        }

        // Seller Releases Crypto
        if (data.startsWith("trade_release:")) {
            const tradeId = data.replace("trade_release:", "");
            const trade = await db.getTradeById(tradeId);

            if (!trade || trade.status === "completed") {
                await ctx.answerCallbackQuery({ text: "Trade already completed!" });
                return;
            }

            await ctx.editMessageText("⏳ Releasing funds on blockchain... This may take a moment.");

            try {
                // Relayer calls Smart Contract Release
                const txHash = await escrow.release(trade.on_chain_trade_id!, trade.chain as any);
                const finalTxHash = txHash === "already_released" ? (trade.escrow_tx_hash || "already_released") : txHash;

                await db.updateTrade(tradeId, { status: "completed", escrow_tx_hash: finalTxHash });

                // Process VIP Fee Cashback (e.g. rebate for qualifying VIP traders on new ads)
                feeCashbackService.processTradeFeeCashback(tradeId).catch(console.error);

                const txLinkText = finalTxHash && finalTxHash.startsWith("0x") ? `🔗 [View Transaction](${getExplorerUrl(finalTxHash, trade.chain as any)})` : "";

                await ctx.editMessageText(
                    [
                        "✅ *Crypto Released!*",
                        "",
                        "Trade completed successfully.",
                        txLinkText,
                    ].filter(Boolean).join("\n"),
                    { parse_mode: "Markdown" }
                );

                // Unified Success Broadcast
                try {
                    const order = await db.getOrderById(trade.order_id);
                    const buyerUser = await db.getUserById(trade.buyer_id);
                    const sellerUser = await db.getUserById(trade.seller_id);

                    const tradeWithUsername = {
                        ...trade,
                        seller_username: sellerUser?.username,
                        seller_first_name: sellerUser?.first_name,
                        seller_hide_handle: (sellerUser as any)?.hide_group_handle,
                        buyer_username: buyerUser?.username,
                        buyer_first_name: buyerUser?.first_name,
                        buyer_hide_handle: (buyerUser as any)?.hide_group_handle,
                        release_tx_hash: txHash,
                    };

                    await broadcastTradeSuccess(tradeWithUsername, order || trade);
                    if (order) {
                        deleteAdBroadcasts(order.id, "completed").catch(console.error);
                    }
                } catch (e) {
                    console.error("Trade broadcast error:", e);
                }

                // Notify Buyer
                const buyer = await db.getUserById(trade.buyer_id);
                if (buyer && buyer.telegram_id) {
                    await ctx.api.sendMessage(
                        buyer.telegram_id,
                        `✅ *Trade Completed!*\n\nSeller has released ${escapeMarkdown(formatTokenAmount(trade.amount, trade.token))}.\nThe funds are now in your wallet (smart contract release).\n\nTransaction: [View on BaseScan](${getExplorerUrl(txHash)})`,
                        { parse_mode: "Markdown" }
                    );
                }

                // Update stats & Trust Scores
                await Promise.all([
                    db.completeUserTrade(trade.seller_id, true),
                    db.completeUserTrade(trade.buyer_id, true)
                ]);

            } catch (error) {
                console.error("Release failed:", error);
                await ctx.editMessageText("❌ Release failed. Please try again or contact support.");
            }
        }

        // Dispute
        if (data.startsWith("trade_dispute:")) {
            const tradeId = data.replace("trade_dispute:", "");
            const trade = await db.getTradeById(tradeId);
            await db.updateTrade(tradeId, { status: "disputed" });

            // SYNC ON-CHAIN if it's a contract trade
            if (trade?.on_chain_trade_id) {
                try {
                    console.log(`[BOT] Syncing dispute for trade ${trade.on_chain_trade_id} on-chain...`);
                    await escrow.raiseDispute(trade.on_chain_trade_id, "Dispute raised via Bot", trade.chain as any);
                } catch (err: any) {
                    console.error(`[BOT] Failed to sync dispute on-chain for trade ${trade.on_chain_trade_id}:`, err.message);
                }
            }

            await ctx.editMessageText("⚠️ Dispute opened. Support will review this case.");

            // Notify Admins
            const admins = env.ADMIN_IDS;
            for (const adminId of admins) {
                const kb = new InlineKeyboard()
                    .text("⚖️ Resolve (Release)", `resolve:${tradeId}:buyer`).row()
                    .text("🔁 Resolve (Refund)", `resolve:${tradeId}:seller`).row()
                    .text("🤖 AI Analysis", `ai_analyze_dispute:${tradeId}`);

                await ctx.api.sendMessage(adminId, `🚨 *New Dispute Raised\\!*\nTrade: \`${escapeMarkdown(tradeId)}\`\nPlease review carefully\\.`, {
                    parse_mode: "Markdown",
                    reply_markup: kb
                });
            }
        }

        // AI Dispute Analysis
        if (data.startsWith("ai_analyze_dispute:")) {
            if (!isAdmin(ctx)) return;
            const tradeId = data.replace("ai_analyze_dispute:", "");
            const trade = await db.getTradeById(tradeId);
            if (!trade) return;

            await ctx.answerCallbackQuery({ text: "🤖 AI is analyzing evidence..." });

            const [buyer, seller] = await Promise.all([
                db.getUserById(trade.buyer_id),
                db.getUserById(trade.seller_id)
            ]);

            const analysis = await ai.analyzeDispute({
                tradeAmount: trade.amount,
                fiatAmount: trade.fiat_amount,
                buyerName: buyer?.username || "Anon",
                sellerName: seller?.username || "Anon",
                buyerTrades: buyer?.trade_count || 0,
                sellerTrades: seller?.trade_count || 0,
                buyerTrustScore: buyer?.trust_score || 0,
                sellerTrustScore: seller?.trust_score || 0,
                reason: "User raised dispute (auto-check)",
                evidence: [] // In production, we'd pass payment proof analysis here
            });

            await ctx.reply(
                [
                    "🤖 *AI Dispute Analysis*",
                    "",
                    `Recommendation: *${escapeMarkdown(analysis.recommendation.toUpperCase())}*`,
                    `Confidence: ${escapeMarkdown(Math.round(analysis.confidence * 100).toString())}%`,
                    "",
                    `Reasoning: _${escapeMarkdown(analysis.reasoning)}_`,
                ].join("\n"),
                { parse_mode: "Markdown" }
            );
        }

        // Admin: List Disputes
        if (data === "admin_disputes_list") {
            if (!isAdmin(ctx)) return;
            const disputes = await db.getDisputedTrades();

            if (disputes.length === 0) {
                await ctx.answerCallbackQuery({ text: "✅ No active disputes!" });
                return;
            }

            const keyboard = new InlineKeyboard();
            disputes.forEach(d => {
                keyboard.text(`⚖️ Trade #${d.on_chain_trade_id || d.id.slice(0, 4)}`, `trade_view:${d.id}`).row();
            });
            keyboard.text("🔙 Back to Dashboard", "admin_stats_refresh");

            await ctx.editMessageText("⚖️ *Active Disputes*\nSelect a trade to investigate:", {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });
            await ctx.answerCallbackQuery();
        }

        // Admin: Refresh Stats (Also acts as Dashboard home)
        if (data === "admin_stats_refresh") {
            if (!isAdmin(ctx)) return;
            try {
                const [stats, relayerUsdc, relayerEth, contractFees] = await Promise.all([
                    db.getStats(),
                    wallet.getTokenBalance(env.ADMIN_WALLET_ADDRESS, env.USDC_ADDRESS, 'base'),
                    wallet.getBalances(env.ADMIN_WALLET_ADDRESS).then(b => b.eth),
                    wallet.getTokenBalance(env.ESCROW_CONTRACT_ADDRESS, env.USDC_ADDRESS, 'base')
                ]);

                const keyboard = new InlineKeyboard()
                    .text("⚖️ View Active Disputes", "admin_disputes_list").row()
                    .text("🔄 Refresh Stats", "admin_stats_refresh");

                await ctx.editMessageText(
                    [
                        "⚙️ *Admin Dashboard*",
                        "",
                        "📈 *System Stats*",
                        `Users: ${escapeMarkdown(String(stats.total_users))}`,
                        `Ads: ${escapeMarkdown(String(stats.active_orders))} active`,
                        `Trades: ${escapeMarkdown(String(stats.total_trades))} (${escapeMarkdown(String(stats.completed_trades))} ok)`,
                        `Volume: ${escapeMarkdown(formatTokenAmount(stats.total_volume_generic))}`,
                        "",
                        "💰 *Relayer Wallet*",
                        `Address: \`${escapeMarkdown(truncateAddress(env.ADMIN_WALLET_ADDRESS))}\``,
                        `Balance: *${escapeMarkdown(String(relayerUsdc))} USDC*`,
                        `Gas: *${escapeMarkdown(String(relayerEth))} ETH*`,
                        "",
                        "🏧 *Escrow Contract*",
                        `Collected Fees: *${escapeMarkdown(String(contractFees))} USDC*`,
                        "",
                        "━━━━━━━━━━━━━━━━",
                        "Fees are sent to your wallet automatically upon release\\.",
                    ].join("\n"),
                    { parse_mode: "Markdown", reply_markup: keyboard }
                );
            } catch (e) {
                await ctx.answerCallbackQuery({ text: "❌ Refresh failed." });
            }
        }

        // My Trades View Handler (Button)
        if (data === "mytrades_view") {
            const user = await ensureUser(ctx);
            try {
                const trades = await db.getUserTrades(user.id);

                if (trades.length === 0) {
                    await ctx.editMessageText("📭 You have no active trades.");
                    await ctx.answerCallbackQuery();
                    return;
                }

                const keyboard = new InlineKeyboard();

                const statusMap: any = {
                    'created': '🆕 Created',
                    'in_escrow': '🟡 In Escrow',
                    'fiat_sent': '🔵 Paid',
                    'completed': '✅ Completed',
                    'disputed': '🔴 Disputed',
                    'cancelled': '❌ Cancelled'
                };

                trades.forEach((t: any) => {
                    const isBuyer = t.buyer_id === user.id;
                    const role = isBuyer ? "🟢 Buying" : "🔴 Selling";
                    const amt = formatTokenAmount(t.amount, t.token);
                    const status = statusMap[t.status] || t.status;

                    keyboard.text(`${role} ${amt} (${status})`, `trade_view:${t.id}`).row();
                });

                await ctx.editMessageText("📋 *Your Trades*\nSelect a trade to view actions:", {
                    parse_mode: "Markdown",
                    reply_markup: keyboard
                });
            } catch (e) {
                console.error("MyTrades error:", e);
                await ctx.answerCallbackQuery({ text: "❌ Failed to fetch trades." });
            }
            await ctx.answerCallbackQuery();
        }

        // Handle dispute resolution
        if (data.startsWith("resolve:")) {
            if (!isAdmin(ctx)) {
                await ctx.answerCallbackQuery({ text: "Admin only!" });
                return;
            }

            const [, tradeId, action] = data.split(":");
            const releaseToBuyer = action === "buyer";

            try {
                const trade = await db.getTradeById(tradeId);

                // Update database
                await db.updateTrade(tradeId, {
                    status: "resolved",
                    resolution: releaseToBuyer ? "Released to buyer" : "Refunded to seller",
                    resolved_by: (await ensureUser(ctx)).id,
                });

                if (trade) {
                    if (trade.order_id) {
                        db.updateOrder(trade.order_id, { status: "cancelled" }).catch(console.error);
                    }
                    if (releaseToBuyer) {
                        deleteAdBroadcasts(trade.order_id, "cancelled").catch(console.error);
                    } else {
                        await db.revertFillOrder(trade.order_id, trade.amount);
                        deleteAdBroadcasts(trade.order_id, "cancelled").catch(console.error);
                    }
                }

                await ctx.editMessageText(
                    `✅ Dispute resolved! ${releaseToBuyer ? "Released to buyer" : "Refunded to seller"}.`
                );
            } catch (error) {
                await ctx.answerCallbackQuery({ text: "Failed to resolve dispute." });
            }
        }

        // Handle cancel
        if (data.startsWith("cancel_action")) {
            // Check for embedded user ID
            if (data.includes(":")) {
                const parts = data.split(":");
                const creatorId = parseInt(parts[1]);
                if (!isNaN(creatorId) && ctx.from.id !== creatorId) {
                    await ctx.answerCallbackQuery({ text: "⚠️ Expected creator to cancel.", show_alert: true });
                    return;
                }
            } else {
                // Reject legacy buttons without ID
                await ctx.answerCallbackQuery({ text: "⚠️ Action expired or invalid.", show_alert: true });
                return;
            }

            await ctx.deleteMessage().catch(() => { });
            ctx.session.ad_draft = undefined;
            ctx.session.send_draft = undefined;
            ctx.session.awaiting_input = undefined;
            await ctx.answerCallbackQuery({ text: "Action cancelled." });
        }

        // Handle setup UPI button
        if (data === "setup_upi") {
            ctx.session.awaiting_input = "upi_id";
            await ctx.editMessageText(
                [
                    "📱 *Enter your UPI ID*",
                    "",
                    "Type your UPI ID below:",
                    "",
                    "Examples: \`yourname@upi\`, \`9876543210@paytm\`",
                ].join("\n"),
                { parse_mode: "Markdown" }
            );
            await ctx.answerCallbackQuery();
        }

        // Handle export key button (from /wallet)
        if (data === "export_key") {
            // Redirect to /export flow with confirmation
            const user = await ensureUser(ctx);
            if (!user.wallet_address || !env.MASTER_WALLET_SEED) {
                await ctx.answerCallbackQuery({ text: "No wallet found!" });
                return;
            }

            const keyboard = new InlineKeyboard()
                .text("⚠️ Yes, show my private key", "confirm_export")
                .row()
                .text("❌ Cancel", `cancel_action:${user.id}`);

            await ctx.editMessageText(
                [
                    "🔒 *Export Private Key*",
                    "",
                    "⚠️ *WARNING:*",
                    "• Anyone with your private key can STEAL your funds",
                    "• NEVER share it with anyone",
                    "• The key will auto-delete in 60 seconds",
                    "",
                    "Are you sure?",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
            await ctx.answerCallbackQuery();
        }

        // Handle confirm export — SHOW THE KEY
        if (data === "confirm_export") {
            const user = await ensureUser(ctx);

            if (!user.wallet_address || !env.MASTER_WALLET_SEED) {
                await ctx.answerCallbackQuery({ text: "No wallet found!" });
                return;
            }

            try {
                const derived = wallet.deriveWallet(user.wallet_index);

                // Send the key
                const keyMsg = await ctx.reply(
                    [
                        "🔐 *YOUR PRIVATE KEY*",
                        "",
                        `\`${escapeMarkdown(derived.privateKey)}\``,
                        "",
                        `Address: \`${escapeMarkdown(derived.address)}\``,
                        "",
                        "⚠️ This message will self-destruct in 60 seconds.",
                        "📸 Screenshot it NOW and store it safely!",
                        "",
                        "With this key you can import your wallet into:",
                        "• MetaMask",
                        "• Trust Wallet",
                        "• Rabby",
                        "• Any EVM wallet",
                    ].join("\n"),
                    { parse_mode: "Markdown" }
                );

                // Delete the confirmation message
                await ctx.editMessageText("✅ Private key sent below ⬇️ (auto-deletes in 60s)");

                // Auto-delete key message after 60 seconds
                setTimeout(async () => {
                    try {
                        await ctx.api.deleteMessage(keyMsg.chat.id, keyMsg.message_id);
                        await ctx.api.sendMessage(keyMsg.chat.id,
                            "🗑️ Private key message deleted for security.\n\nUse /export again if needed."
                        );
                    } catch {
                        // Message may already be deleted
                    }
                }, 60000);

                await ctx.answerCallbackQuery();
                handled = true;
            } catch (error) {
                console.error("Export error:", error);
                await ctx.answerCallbackQuery({ text: "Failed to export key." });
                handled = true;
            }
        }

        // Default fallback to prevent loading spinners on unhandled buttons
        if (!handled) {
            try {
                await ctx.answerCallbackQuery();
            } catch (e) {
                // Ignore already answered errors
            }
        }
    } catch (error: any) {
        console.error("CRITICAL: Callback handler crashed:", error);
        try {
            await ctx.answerCallbackQuery({ text: "❌ System Error: " + error.message, show_alert: true });
        } catch (e) { }
    }
});

// ═══════════════════════════════════════════════════════════════
//              NATURAL LANGUAGE HANDLER (AI)
// ═══════════════════════════════════════════════════════════════



bot.on("message:text", async (ctx) => {
    await ctx.replyWithChatAction("typing").catch(() => { });
    const text = ctx.message.text;
    console.log(`[BOT] Received text: "${text}" from ${ctx.from.id} in ${ctx.chat.type} (${ctx.chat.id})`);

    // Skip commands
    if (text.startsWith("/")) return;

    const botInfo = await ctx.api.getMe();
    const botName = botInfo.username;
    console.log(`[BOT] My username: ${botName}`);

    let cleanText = text;

    // Strip mention if present (e.g. "@MyBot sell 100") - Case Insensitive
    if (botName) {
        const mentionRegex = new RegExp(`^@${botName}`, "i");
        if (mentionRegex.test(text)) {
            // Replace only the start, case-insensitively
            cleanText = text.replace(mentionRegex, "").trim();
        }
    }
    console.log(`[BOT] Clean text: "${cleanText}"`);

    let forceViewOrders = false;

    // In groups, ONLY reply if mentioned OR using whitelisted keywords
    if (ctx.chat.type !== "private") {
        const isMentioned = botName ? new RegExp(`@${botName}`, "i").test(text) : false;

        // Whitelist certain keywords to work without mentions in groups
        // Using ^ and $ ensures the bot only triggers if the entire message is exactly the keyword
        // [!?.]* allows optional punctuation at the end (like "live ads?")
        const whitelistedKeywords = [/^\s*(live\s*)?ads?[!?.]*\s*$/i, /^\s*market[!?.]*\s*$/i];
        const isWhitelisted = whitelistedKeywords.some(regex => regex.test(text));

        console.log(`[BOT] Group logic - Mentioned: ${isMentioned}, Whitelisted: ${isWhitelisted}`);

        if (!isMentioned && !isWhitelisted) {
            console.log("[BOT] Ignoring non-mention in group");
            return; // Ignore random group chatter
        }

        // Bypass AI in groups if it's just a whitelisted keyword
        if (isWhitelisted && !isMentioned) {
            forceViewOrders = true;
        }
    } else {
        // Fast-path in DMs for ad/ads/market
        if (/^\s*(live\s*)?ads?[!?.]*\s*$/i.test(text) || /^\s*market[!?.]*\s*$/i.test(text)) {
            forceViewOrders = true;
        }
    }

    const user = await ensureUser(ctx);

    // ── 6-DIGIT LINK CODE HANDLER (Link Web Dashboard Account) ──
    const codeMatch = text.trim().match(/^(?:\/link\s+)?(\d{6})$/);
    if (codeMatch && ctx.chat.type === "private") {
        const inputCode = codeMatch[1];
        const from = ctx.from!;
        const linked = await db.linkTelegramByCode(
            from.id,
            from.username || null,
            from.first_name || null,
            inputCode
        );

        if (linked) {
            await ctx.reply(
                `🎉 *Account Linked Successfully!*\n\nYour Telegram account (@${escapeMarkdown(from.username || from.first_name || "")}) is now linked to your P2PFather Web Dashboard profile.\n\nYou can return to the Web Dashboard now! 🚀`,
                { parse_mode: "Markdown" }
            );
            return;
        } else {
            await ctx.reply(
                `❌ *Invalid or Expired Link Code*\n\nPlease generate a fresh link code from your Web Dashboard Profile and try again.`,
                { parse_mode: "Markdown" }
            );
            return;
        }
    }

    // Handle awaiting input states
    if (ctx.session.awaiting_input === "wallet_address") {
        // Validate Ethereum address
        if (/^0x[a-fA-F0-9]{40}$/.test(text.trim())) {
            await db.updateUser(user.id, { wallet_address: text.trim() });
            ctx.session.awaiting_input = undefined;
            ctx.session.wallet_address = text.trim();
            await ctx.reply(`✅ Wallet set to \`${escapeMarkdown(truncateAddress(text.trim()))}\`\\n\\nYou're ready to trade\\! Try /sell or /buy`, { parse_mode: "Markdown" });
            return;
        } else {
            await ctx.reply("❌ Invalid address. Please send a valid Base wallet address (0x...)");
            return;
        }
    }

    // --- SEND CRYPTO FLOW ---
    if (ctx.session.awaiting_input === "send_to_address") {
        const addr = text.trim();
        if (/^0x[a-fA-F0-9]{40}$/.test(addr)) {
            ctx.session.send_draft = { ...ctx.session.send_draft, to_address: addr };
            ctx.session.awaiting_input = "send_amount";

            const token = ctx.session.send_draft?.token || "USDC";

            await ctx.reply(
                [
                    "💸 *Send Crypto — Step 2/3*",
                    "",
                    `Token: *${escapeMarkdown(token)}*`,
                    `To: \`${escapeMarkdown(truncateAddress(addr))}\``,
                    "",
                    `How much ${escapeMarkdown(token)} do you want to send?`,
                    "",
                    "Send the amount (e.g., \`100\`):",
                ].join("\n"),
                { parse_mode: "Markdown" }
            );
            return;
        } else {
            await ctx.reply("❌ Invalid address. Please send a valid wallet address (0x...)");
            return;
        }
    }

    if (ctx.session.awaiting_input === "send_amount") {
        const amount = parseFloat(text.trim());
        if (isNaN(amount) || amount <= 0) {
            await ctx.reply("❌ Invalid amount. Please send a number.");
            return;
        }

        const draft = ctx.session.send_draft;
        if (!draft) return;

        const token = draft.token || "USDC";
        const addr = draft.to_address || "";

        // Check balance
        const balance = draft.token === "ETH"
            ? await wallet.getBalances(user.wallet_address!).then(b => b.eth)
            : await wallet.getTokenBalance(user.wallet_address!, draft.token_address!);

        if (parseFloat(balance) < amount) {
            await ctx.reply(`❌ Insufficient balance! Your ${token} balance is ${balance}.`);
            return;
        }

        if (ctx.session.send_draft) {
            ctx.session.send_draft.amount = amount;
        }
        ctx.session.awaiting_input = undefined;

        const keyboard = new InlineKeyboard()
            .text("✅ Confirm & Send", "confirm_send")
            .text("❌ Cancel", "cancel_action");

        await ctx.reply(
            [
                "💸 *Send Crypto — Final Step*",
                "",
                `Token: *${escapeMarkdown(token)}*`,
                `Amount: *${escapeMarkdown(String(amount))} ${escapeMarkdown(token)}*`,
                `To: \`${escapeMarkdown(addr)}\``,
                "",
                "⚠️ *Confirm this transaction?*",
                "This action cannot be undone\\.",
            ].join("\n"),
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
        return;
    }

    if (ctx.session.awaiting_input === "upi_id") {
        const upiId = text.trim().toLowerCase();

        // Basic UPI format validation
        if (!upiId.includes("@") || upiId.length < 5) {
            await ctx.reply(
                [
                    "❌ Invalid UPI format.",
                    "",
                    "UPI IDs look like: \`yourname@upi\`",
                    "",
                    "Try again or send /upi to skip\\.",
                ].join("\n"),
                { parse_mode: "Markdown" }
            );
            return;
        }

        await db.updateUser(user.id, { upi_id: upiId });
        ctx.session.awaiting_input = undefined;

        const keyboard = new InlineKeyboard()
            .text("📢 Create Ad Now", "newad_start")
            .text("🔍 Browse Ads", "ads:all");

        await ctx.reply(
            [
                "✅ *UPI ID Saved\\!*",
                "",
                `📱 UPI: \`${escapeMarkdown(upiId)}\``,
                "",
                "You're all set\\! What would you like to do?",
            ].join("\n"),
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
        return;
    }



    // Try AI intent parsing
    try {
        // Save to conversation history
        ctx.session.conversation_history = ctx.session.conversation_history || [];
        ctx.session.conversation_history.push({ role: "user", content: cleanText });

        // If OpenAI is configured, use AI parsing
        let intent;
        if (forceViewOrders) {
            intent = { intent: "VIEW_ORDERS", params: {} };
        } else if (env.OPENAI_API_KEY) {
            intent = await ai.parseIntent(cleanText, ctx.session.conversation_history);
        } else {
            // Fallback to keyword matching
            intent = (ai as any).fallbackParse
                ? (ai as any).fallbackParse(cleanText)
                : { intent: "UNKNOWN", confidence: 0, params: {}, response: "" };
        }

        // Capture Group ID for Ad Creation
        if (intent.intent === "CREATE_SELL_ORDER" || intent.intent === "CREATE_BUY_ORDER") {
            if (ctx.chat.type === "supergroup" || ctx.chat.type === "group") {
                // Attach group ID to params so we know where to broadcast later
                intent.params.target_group_id = ctx.chat.id;
            }
        }

        // Save AI response to history
        ctx.session.conversation_history.push({
            role: "assistant",
            content: intent.response,
        });

        // Keep history manageable
        if (ctx.session.conversation_history.length > 20) {
            ctx.session.conversation_history = ctx.session.conversation_history.slice(-10);
        }

        // Route based on intent
        switch (intent.intent) {
            case "CREATE_SELL_ORDER":
            case "CREATE_BUY_ORDER": {
                const miniAppUrl = "https://p2pfather.com/miniapp/create";
                const keyboard = ctx.chat.type === "private"
                    ? new InlineKeyboard().webApp("📱 Create Ad in Mini App", miniAppUrl)
                    : new InlineKeyboard().url("📱 Create Ad in Mini App", `https://t.me/${ctx.me.username}?start=newad_${ctx.chat.id}`);

                await ctx.reply(
                    [
                        "📢 *Create a New Ad*",
                        "",
                        "Ad creation has moved to the Mini App for a faster and more secure experience\\! 🚀",
                        "",
                        "Tap below to get started:",
                    ].join("\n"),
                    { parse_mode: "Markdown", reply_markup: keyboard }
                );
                break;
            }

            case "VIEW_ORDERS":
                // Trigger /orders logic
                await ctx.reply("📊 Loading orders...");
                // Re-use orders command
                try {
                    // Normalize type (ensure it's buy, sell, or undefined)
                    let orderType: any = intent.params.type;
                    if (orderType !== "buy" && orderType !== "sell") {
                        orderType = undefined; // Show all if type is "ads" or unknown
                    }

                    const orders = await db.getActiveOrders(orderType, intent.params.token, 10);
                    if (orders.length === 0) {
                        const keyboard = ctx.chat.type === "private"
                            ? new InlineKeyboard().webApp("✨ Create Ad", "https://p2pfather.com/miniapp/create")
                            : new InlineKeyboard().url("✨ Create Ad", `https://t.me/${ctx.me.username}?start=newad_${ctx.chat.id}`);

                        await ctx.reply(
                            "🌟 *Market is Quiet* 🌟\n\nThere are no active orders right now\\.\n\n✨ Be the first to list an ad and set your own price\\! 🚀",
                            {
                                parse_mode: "Markdown",
                                reply_markup: keyboard
                            }
                        );
                    } else {
                        const header = [
                            "╭─────────────────────────────╮",
                            "│  🏦 P2P FATHER · LIVE ORDERS │",
                            "╰─────────────────────────────╯",
                        ].join("\n");
                        const list = orders.map((o) => formatOrder(o)).join("\n\n");
                        const footer = "\n⚡ Trade safely on @P2p_fatherbot";
                        const fullMsg = `${header}\n\n${list}\n\n${footer}`;

                        try {
                            await ctx.reply(fullMsg, { parse_mode: "HTML" });
                        } catch (err: any) {
                            console.error("VIEW_ORDERS Markdown Error:", err);
                            await ctx.reply(fullMsg);
                        }
                    }
                } catch (err: any) {
                    console.error("VIEW_ORDERS Database Error:", err);
                    await ctx.reply(`❌ Could not load orders. Error: ${err.message || 'Unknown'}`);
                }
                break;

            case "CHECK_BALANCE":
                if (user.wallet_address) {
                    try {
                        const balance = await wallet.getTokenBalance(user.wallet_address, env.USDC_ADDRESS, 'base');
                        const ethBalance = await wallet.getBalances(user.wallet_address).then(b => b.eth);
                        await ctx.reply(`💰 Balance: *${escapeMarkdown(balance)} USDC*\n⛽ Gas: *${escapeMarkdown(ethBalance)} ETH*\n\nAddress: \`${escapeMarkdown(truncateAddress(user.wallet_address))}\``, { parse_mode: "Markdown" });
                    } catch {
                        await ctx.reply("⚠️ Could not fetch balance right now.");
                    }
                } else {
                    await ctx.reply("No wallet set! Use /wallet to set your address.");
                }
                break;

            case "SEND_CRYPTO":
                {
                    const amount = intent.params.amount;
                    const token = intent.params.token || "USDC";
                    const addr = intent.params.address;

                    if (amount && addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) {
                        // User gave all details, jump to payment checks
                        const tokenUpper = token.toUpperCase();
                        const tokenAddress = tokenUpper === "ETH" ? "native" : (tokenUpper === "USDT" ? env.USDT_ADDRESS : env.USDC_ADDRESS);

                        ctx.session.send_draft = {
                            to_address: addr,
                            token: tokenUpper,
                            token_address: tokenAddress,
                            amount: parseFloat(amount)
                        };

                        // Check balance
                        const balance = tokenUpper === "ETH"
                            ? await wallet.getBalances(user.wallet_address!).then(b => b.eth)
                            : await wallet.getTokenBalance(user.wallet_address!, tokenAddress);
                        if (parseFloat(balance) < parseFloat(amount)) {
                            await ctx.reply(`❌ Insufficient balance! Your ${token.toUpperCase()} balance is ${balance}.`);
                            return;
                        }

                        const keyboard = new InlineKeyboard()
                            .text("✅ Confirm & Send", "confirm_send")
                            .text("❌ Cancel", `cancel_action:${ctx.from.id}`);

                        await ctx.reply(
                            [
                                "💸 *Send Crypto — AI Confirmation*",
                                "",
                                `Token: *${escapeMarkdown(token.toUpperCase())}*`,
                                `Amount: *${escapeMarkdown(amount)} ${escapeMarkdown(token.toUpperCase())}*`,
                                `To: \`${escapeMarkdown(addr)}\``,
                                "",
                                "⚠️ *Confirm this transaction?*",
                                "This action cannot be undone\\.",
                            ].join("\n"),
                            { parse_mode: "Markdown", reply_markup: keyboard }
                        );
                    } else {
                        // Not enough details, start the flow
                        ctx.session.send_draft = {};
                        const keyboard = new InlineKeyboard()
                            .text("💵 USDC", "send_token:USDC")
                            .text("dt USDT", "send_token:USDT")
                            .text("💎 ETH", "send_token:ETH")
                            .row()
                            .text("❌ Cancel", "cancel_action");

                        await ctx.reply(
                            [
                                "💸 *Withdraw Crypto*",
                                "",
                                "I can help you send crypto to any Base wallet\\.",
                                "",
                                "Which token would you like to send?",
                            ].join("\n"),
                            { parse_mode: "MarkdownV2", reply_markup: keyboard }
                        );
                    }
                }
                break;

            case "BRIDGE_TOKENS":
                // Disabled — silently ignore
                break;

            case "HELP":
                await ctx.reply(intent.response || "Type /help for full instructions!");
                break;

            case "PROFILE":
                // Trigger profile command
                await ctx.api.sendMessage(ctx.chat.id, "Loading profile...");
                break;

            case "MARKET_NEWS":
                await ctx.reply("📰 *Checking Market Data...*", { parse_mode: "MarkdownV2" });
                const queryText = cleanText.startsWith("/") ? "" : cleanText;
                const digest = await market.getMarketDigest(queryText);
                await ctx.reply(digest, { parse_mode: "MarkdownV2" });
                break;

            default:
                await ctx.reply(intent.response || "I'm not sure what you mean. Try /help to see what I can do! 🤖");
        }
    } catch (error) {
        logger.error("MESSAGE_HANDLER_ERROR", "Error in message handler", error);
        await ctx.reply("🤖 Something went wrong. Try again or use /help for commands.");
    }
});

// ═══════════════════════════════════════════════════════════════
//              PHOTO HANDLER (Payment Proofs)
// ═══════════════════════════════════════════════════════════════

bot.on("message:photo", async (ctx) => {
    const user = await ensureUser(ctx);

    if (ctx.session.current_trade_id) {
        const trade = await db.getTradeById(ctx.session.current_trade_id);
        if (!trade) return;

        // Highest resolution
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const file = await ctx.api.getFile(photo.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

        const statusMsg = await ctx.reply("📸 *Analyzing payment proof with AI...*", { parse_mode: "MarkdownV2" });

        // AI Vision Analysis
        const analysis = await ai.analyzePaymentProof(
            fileUrl,
            trade.fiat_amount,
            trade.payment_method === "UPI" ? (user.upi_id || "Seller") : "Seller"
        );

        let verificationText = "";
        if (analysis.confidence > 0.7) {
            if (analysis.amountMatch && analysis.status === "success") {
                verificationText = "✅ *AI Verification:* Payment appears valid.";
            } else {
                verificationText = `⚠️ *AI Warning:* ${analysis.reason || "Details do not perfectly match."}`;
            }
        }

        await ctx.api.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            [
                "📸 *Payment proof received!*",
                "",
                `Trade: \`#${trade.on_chain_trade_id || trade.id.slice(0, 4)}\``,
                verificationText,
                "",
                "The seller has been notified to check their account.",
                "If they don't respond, you can open a dispute via the Mini App\\.",
            ].join("\n"),
            { parse_mode: "MarkdownV2" }
        );

        // Notify Seller
        const seller = await db.getUserById(trade.seller_id);
        if (seller && seller.telegram_id) {
            await ctx.api.sendPhoto(seller.telegram_id, photo.file_id, {
                caption: `📸 *Payment Proof Attached!*\n\nBuyer says they paid ₹${trade.fiat_amount}.\n${verificationText}`,
                parse_mode: "Markdown"
            });
        }
    } else if (ctx.chat?.type === "private") {
        await ctx.reply(
            "📸 Got your photo! If this is a payment proof, first open the trade in /mytrades and then send the proof."
        );
    }
});

// ═══════════════════════════════════════════════════════════════
//                    ERROR HANDLER
// ═══════════════════════════════════════════════════════════════

bot.catch((err) => {
    console.error("Bot error:", err);
});

// Define command lists
const privateCommands = [
    { command: "start", description: "Start the bot" },
    { command: "open", description: "Open the Mini App" },
    { command: "newad", description: "Create a buy/sell ad" },
    { command: "ads", description: "Browse live P2P ads" },
    { command: "myads", description: "Manage your ads" },
    { command: "mytrades", description: "Your trade history" },
    { command: "portfolio", description: "Check balance & send" },
    { command: "wallet", description: "Wallet settings" },
    { command: "payment", description: "Set payment methods (UPI/Phone/Bank)" },
    { command: "profile", description: "Your stats & profile" },
    { command: "help", description: "How to use this bot" },
    { command: "send", description: "Withdraw crypto" },
    { command: "invite", description: "Refer friends & earn points" },
    { command: "leaderboard", description: "Top traders & invite champions" },
];

const groupCommands = [
    { command: "ads", description: "Browse live P2P ads" },
    { command: "help", description: "How to use this bot" },
];

// Register minimal commands for group chats
bot.api.setMyCommands(groupCommands, { scope: { type: "all_group_chats" } })
    .catch((err: any) => console.error("setMyCommands (groups) error:", err));

export { bot, notifyTrader };


