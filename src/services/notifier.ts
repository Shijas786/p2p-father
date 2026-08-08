/**
 * Unified Notification Service
 *
 * Sends alerts to users via their preferred channel:
 *   - Telegram (via grammY bot.api)
 *   - WhatsApp (via Hypermeow Go bridge)
 *   - Both
 *
 * Usage:
 *   import { sendUserAlert } from './notifier';
 *   await sendUserAlert(user, '✅ Trade completed!');
 */

import type { User } from "../types";

export async function sendUserAlert(
    user: User,
    message: string,
    imageBuffer?: Buffer,
    buttons?: { id: string; label: string }[]
): Promise<void> {
    const channel = (user as any).preferred_channel ?? "whatsapp";

    const hasWaPhone = Boolean((user as any).whatsapp_phone);
    const hasTgId  = Boolean(user.telegram_id);

    const sendTelegram = (channel === "telegram" || channel === "both" || (!hasWaPhone && hasTgId)) && hasTgId;
    const sendWhatsApp = (channel === "whatsapp" || channel === "both" || (hasWaPhone && !hasTgId)) && hasWaPhone;

    // ── Send to Telegram ──────────────────────────────────────────────────────
    if (sendTelegram && user.telegram_id) {
        try {
            const { bot } = await import("../bot");
            let replyMarkup: any = undefined;
            if (buttons && buttons.length > 0) {
                const { InlineKeyboard } = await import("grammy");
                const kb = new InlineKeyboard();
                buttons.forEach(b => kb.text(b.label, b.id).row());
                replyMarkup = kb;
            }

            if (imageBuffer) {
                const { InputFile } = await import("grammy");
                await bot.api.sendPhoto(user.telegram_id, new InputFile(imageBuffer, "image.png"), { caption: message, parse_mode: "Markdown", reply_markup: replyMarkup });
            } else {
                await bot.api.sendMessage(user.telegram_id, message, { parse_mode: "Markdown", reply_markup: replyMarkup });
            }
        } catch (err) {
            console.error(`[Notifier] Telegram send failed for user ${user.id}:`, err);
        }
    }

    // ── Send to WhatsApp via Hypermeow ────────────────────────────────────────
    if (sendWhatsApp && (user as any).whatsapp_phone) {
        try {
            const { hypermeowClient } = await import("../whatsapp/hypermeowClient");
            const phone = (user as any).whatsapp_phone as string;
            const jid   = `${phone}@s.whatsapp.net`;

            if (buttons && buttons.length > 0) {
                let shortcutText = message;
                const shortcuts = buttons.map(b => `👉 ${b.label}: \`${b.id}\``).join("\n");
                shortcutText += `\n\n*Quick Commands:*\n${shortcuts}`;

                await hypermeowClient.sendButtons(jid, shortcutText, buttons.slice(0, 3));
            } else {
                await hypermeowClient.sendText(jid, message);
            }
        } catch (err) {
            console.error(`[Notifier] WhatsApp send failed for user ${user.id}:`, err);
        }
    }
}

/**
 * Broadcast a text message to all users by preferred channel.
 * Admin-only utility — use sparingly.
 */
export async function broadcastToAllUsers(
    message: string,
    channelFilter?: "telegram" | "whatsapp" | "both"
): Promise<{ sent: number; failed: number }> {
    const { db } = await import("../db/client");
    const users: User[] = await (db as any).getAllUsers();

    let sent = 0;
    let failed = 0;

    for (const user of users) {
        const userChannel = (user as any).preferred_channel ?? "telegram";
        if (channelFilter && userChannel !== channelFilter && userChannel !== "both") continue;

        try {
            await sendUserAlert(user, message);
            sent++;
            // Small delay to avoid rate limits
            await new Promise((r) => setTimeout(r, 100));
        } catch {
            failed++;
        }
    }

    return { sent, failed };
}
