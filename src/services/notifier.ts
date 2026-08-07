/**
 * Unified Notification Service
 *
 * Sends alerts to users via their preferred channel:
 *   - Telegram (via grammY bot.api)
 *   - WhatsApp (via Baileys sock)
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
    imageBuffer?: Buffer
): Promise<void> {
    const channel = (user as any).preferred_channel ?? "telegram";

    const sendTelegram = channel === "telegram" || channel === "both";
    const sendWhatsApp = channel === "whatsapp" || channel === "both";

    // ── Send to Telegram ──────────────────────────────────────────────────────
    if (sendTelegram && user.telegram_id) {
        try {
            const { bot } = await import("../bot");
            if (imageBuffer) {
                const { InputFile } = await import("grammy");
                await bot.api.sendPhoto(user.telegram_id, new InputFile(imageBuffer, "image.png"), { caption: message, parse_mode: "Markdown" });
            } else {
                await bot.api.sendMessage(user.telegram_id, message, { parse_mode: "Markdown" });
            }
        } catch (err) {
            console.error(`[Notifier] Telegram send failed for user ${user.id}:`, err);
        }
    }

    // ── Send to WhatsApp ──────────────────────────────────────────────────────
    if (sendWhatsApp && (user as any).whatsapp_phone) {
        try {
            const { getSock } = await import("../whatsapp/client");
            const sock  = getSock();
            const phone = (user as any).whatsapp_phone as string;
            const jid   = `${phone}@s.whatsapp.net`;

            if (imageBuffer) {
                await sock.sendMessage(jid, { image: imageBuffer, caption: message });
            } else {
                await sock.sendMessage(jid, { text: message });
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
