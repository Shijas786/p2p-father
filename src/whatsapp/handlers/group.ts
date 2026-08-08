/**
 * WhatsApp Group Handler
 * - Responds to @bot mentions in WhatsApp groups
 * - Broadcasts new ads to all registered groups (with rate-limiting)
 */

import type { WASocket, IWebMessageInfo } from "../types";
import { db } from "../../db/client";
import { reply } from "../router";
import { fmtGroupLiveAds, fmtGroupAdBroadcast } from "../formatters";

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
