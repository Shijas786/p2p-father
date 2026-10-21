/**
 * Real-Time Upbit Listing Watcher
 * 
 * Subscribes to Tree News ultra-low latency WebSocket (wss://news.treeofalpha.com/ws).
 * Detects Upbit listing notices & tweets within milliseconds (<500ms).
 * Instantly broadcasts formatted listing alerts to the official P2P Father WhatsApp group.
 */

import WebSocket from "ws";
import { env } from "../config/env";
import { hypermeowClient } from "../whatsapp/hypermeowClient";

const TREE_NEWS_WS_URL = "wss://news.treeofalpha.com/ws";
const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 30000;

// Deduplication cache: stores processed announcement keys with timestamp
const seenAnnouncements = new Map<string, number>();

function pruneSeenAnnouncements() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    for (const [key, ts] of seenAnnouncements.entries()) {
        if (ts < cutoff) {
            seenAnnouncements.delete(key);
        }
    }
}

export interface UpbitParsedNotice {
    id: string;
    token: string;
    markets: string[];
    isKrw: boolean;
    rawTitle: string;
    noticeUrl: string;
    tweetUrl?: string;
    isFromX: boolean;
    tradingOpensAt?: string;
    projectHandle?: string;
    imageUrl?: string;
    timestamp: number;
}

/**
 * Checks if incoming news payload is an Upbit new listing / trading support notice.
 */
export function parseUpbitListing(data: any): UpbitParsedNotice | null {
    if (!data || typeof data !== "object") return null;

    const source = (data.text || data.source || "").toString();
    const body = (data.body || data.title || "").toString();
    const combined = `${source} ${body}`;
    const combinedLower = combined.toLowerCase();

    const sourceLower = source.toLowerCase().trim();
    const linkLower = (data.link || data.url || "").toLowerCase().trim();

    // 🛡️ STRICT AUTHENTICITY GUARD:
    // Only accept announcements originating from Upbit's verified X handles or official website.
    // Strictly blocks random Twitter accounts or scam impersonators (e.g. @Offlcial_Upbit).
    const isOfficialUpbitSource =
        sourceLower === "official_upbit" ||
        sourceLower === "upbit" ||
        sourceLower === "upbitglobal" ||
        linkLower.includes("twitter.com/official_upbit") ||
        linkLower.includes("x.com/official_upbit") ||
        linkLower.includes("twitter.com/upbitglobal") ||
        linkLower.includes("x.com/upbitglobal") ||
        linkLower.includes("upbit.com/service_center/notice");

    if (!isOfficialUpbitSource) return null;

    // 2. Must be a listing announcement (Korean or English)
    const listingKeywords = [
        "market support",     // Exact title in Upbit Korea English tweets
        "supported markets",  // Exact field in Upbit Korea English tweets
        "trading opens at",   // Schedule line in tweet
        "trading open",
        "거래지원",           // Trading support (standard Upbit listing notice term)
        "신규 거래지원",      // New trading support
        "신규 디지털 자산",   // New digital asset
        "마켓 추가",          // Market addition
        "신규",               // New
        "추가",               // Added
        "상장",               // Listed
        "market added",
        "trading support",
        "digital asset",
        "listing",
        "lists",
        "list",
        "adds",
        "added"
    ];

    const isListing = listingKeywords.some((kw) => combinedLower.includes(kw));
    if (!isListing) return null;

    // 3. Detect markets supported (KRW fiat, BTC, USDT)
    const markets: string[] = [];
    if (/krw|원화/i.test(combined)) markets.push("KRW");
    if (/btc/i.test(combined)) markets.push("BTC");
    if (/usdt/i.test(combined)) markets.push("USDT");

    // 4. Extract token symbol (Tree News coins array -> Hashtags -> Parentheses -> Dash)
    let token = "";
    if (Array.isArray(data.coins) && data.coins.length > 0 && data.coins[0]?.symbol) {
        token = data.coins[0].symbol.toUpperCase();
    } else {
        // A. Check hashtags from Upbit X tweets (e.g. #Upbit #AXIS)
        const hashtagMatches = combined.match(/#([A-Z0-9]{2,10})\b/gi);
        if (hashtagMatches) {
            const foundTag = hashtagMatches
                .map((h: string) => h.replace("#", "").toUpperCase())
                .find((h: string) => !["UPBIT", "KRW", "BTC", "USDT", "CRYPTO", "NOTICE", "MARKET"].includes(h));
            if (foundTag) token = foundTag;
        }

        // B. Check parentheses or dashes in notice title: Robotics(AXIS) or - AXIS
        if (!token) {
            const match =
                combined.match(/\(([A-Z0-9]{2,10})\)/) ||
                combined.match(/[-:]\s*([A-Z0-9]{2,10})/);
            if (match && !["KRW", "BTC", "USDT", "MARKET"].includes(match[1].toUpperCase())) {
                token = match[1].toUpperCase();
            }
        }
    }

    const id = data.id || `${token}_${markets.join("_")}_${Date.now()}`;
    const rawLink = String(data.link || data.url || "").trim();

    const isFromX =
        rawLink.includes("twitter.com") ||
        rawLink.includes("x.com") ||
        rawLink.includes("t.co/") ||
        sourceLower.includes("official_upbit");

    const isTweetUrl =
        rawLink.includes("twitter.com") ||
        rawLink.includes("x.com") ||
        rawLink.includes("t.co/");

    // Extract direct upbit link from body if present (e.g. from English / Korean tweet)
    const directNoticeMatch = body.match(/https?:\/\/(?:www\.)?upbit\.com\/[^\s)\]]+/);
    const noticeUrl = directNoticeMatch
        ? directNoticeMatch[0]
        : rawLink.includes("upbit.com")
        ? rawLink
        : "https://upbit.com/service_center/notice";

    const tweetUrl = isTweetUrl ? rawLink : undefined;

    // Extract trading start time if present (e.g. 2026-10-21 22:00 KST)
    const timeMatch = combined.match(/(?:Trading opens at|거래지원 개시 시점)\s*[:：]?\s*([^\n\r]+)/i);
    const tradingOpensAt = timeMatch ? timeMatch[1].trim() : undefined;

    // Extract project Twitter handle if present (e.g. @axisrobotics)
    const projectHandleMatch = combined.match(/@([a-zA-Z0-9_]+)/g);
    const projectHandle = projectHandleMatch?.find(
        (h) => !h.toLowerCase().includes("upbit")
    );

    // Extract poster image if attached
    const imageUrl = (data.image || data.media || data.imageUrl || undefined)?.toString();

    return {
        id: String(id),
        token: token ? `$${token}` : "New Asset",
        markets: markets.length > 0 ? markets : ["Spot"],
        isKrw: markets.includes("KRW"),
        rawTitle: body || source,
        noticeUrl,
        tweetUrl,
        isFromX,
        tradingOpensAt,
        projectHandle,
        imageUrl,
        timestamp: data.ts || Date.now()
    };
}

/**
 * Formats a high-visibility WhatsApp alert message.
 */
export function formatUpbitAlert(notice: UpbitParsedNotice): string {
    const krwBadge = notice.isKrw ? "\n\n🔥 *KRW FIAT PAIR LISTED! (HIGH VOLATILITY)*" : "";
    const tokenDisplay = notice.projectHandle ? `${notice.token} (${notice.projectHandle})` : notice.token;

    let detailsBlock = `🪙 *Token:* ${tokenDisplay}`;
    if (notice.tradingOpensAt) {
        detailsBlock += `\n⏰ *Trading Opens:* ${notice.tradingOpensAt}`;
    } else if (notice.markets && notice.markets.length > 0) {
        detailsBlock += `\n📈 *Markets:* ${notice.markets.join(" / ")}`;
    }

    let linksBlock = `🔗 *Official Notice:* ${notice.noticeUrl}`;
    if (notice.tweetUrl && notice.tweetUrl !== notice.noticeUrl) {
        linksBlock += `\n🐦 *Tweet Link:* ${notice.tweetUrl}`;
    }

    return `🚨 *UPBIT NEW LISTING ALERT!* 🚨${krwBadge}
${detailsBlock}

${linksBlock}

⚡ *P2P Father Market Watch*`;
}

/**
 * Sends the alert message to the official WhatsApp community group.
 * Sends image poster if available with caption, otherwise clean text.
 */
export async function sendUpbitAlertToWhatsApp(notice: UpbitParsedNotice, message: string): Promise<boolean> {
    const officialGroupJid = env.WA_OFFICIAL_GROUP_JID || "120363410362268845@g.us";
    try {
        if (notice.imageUrl) {
            console.log(`[Upbit-Watcher] 📸 Attempting image alert dispatch with: ${notice.imageUrl}`);
            const imageSent = await hypermeowClient.sendImage(officialGroupJid, notice.imageUrl, message);
            if (imageSent) {
                console.log(`[Upbit-Watcher] ✅ Dispatched listing image alert to group: ${officialGroupJid}`);
                return true;
            }
        }

        const success = await hypermeowClient.sendText(officialGroupJid, message);
        if (success) {
            console.log(`[Upbit-Watcher] ✅ Dispatched listing text alert to group: ${officialGroupJid}`);
            return true;
        } else {
            console.warn(`[Upbit-Watcher] ⚠️ SendText returned false for ${officialGroupJid}`);
        }
    } catch (err: any) {
        console.error(`[Upbit-Watcher] ❌ Error sending alert to WhatsApp group:`, err?.message || err);
    }
    return false;
}

let activeWs: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
let isStopping = false;

/**
 * Starts the real-time Upbit listing watcher background service.
 */
export function startUpbitListingWatcher(): void {
    if (env.ENABLE_UPBIT_WATCHER === "false") {
        console.log("[Upbit-Watcher] ⏸️ Disabled via ENABLE_UPBIT_WATCHER=false.");
        return;
    }

    if (activeWs) {
        console.log("[Upbit-Watcher] ℹ️ Already running.");
        return;
    }

    isStopping = false;
    connectWebSocket();
}

function connectWebSocket(): void {
    if (isStopping) return;

    console.log(`[Upbit-Watcher] 🔌 Connecting to Tree News stream (${TREE_NEWS_WS_URL})...`);

    try {
        activeWs = new WebSocket(TREE_NEWS_WS_URL);

        activeWs.on("open", () => {
            console.log("[Upbit-Watcher] 🟢 Connected to Tree News stream! Monitoring Upbit listings 24/7.");
            reconnectAttempts = 0;

            if (env.TREE_NEWS_API_KEY) {
                try {
                    activeWs?.send(`login ${env.TREE_NEWS_API_KEY}`);
                    console.log("[Upbit-Watcher] 🔑 Authenticated with Tree News API key.");
                } catch (e: any) {
                    console.warn("[Upbit-Watcher] Failed to send login command:", e.message);
                }
            }
        });

        activeWs.on("message", async (raw: WebSocket.Data) => {
            try {
                const payload = JSON.parse(raw.toString());
                const notice = parseUpbitListing(payload);

                if (!notice) return;

                // Deduplicate by token and ID
                const dedupeKey = `${notice.token}_${notice.markets.join("_")}`;
                pruneSeenAnnouncements();

                if (seenAnnouncements.has(dedupeKey) || (notice.id && seenAnnouncements.has(notice.id))) {
                    console.log(`[Upbit-Watcher] ⏭️ Skipping duplicate listing announcement for ${notice.token}`);
                    return;
                }

                seenAnnouncements.set(dedupeKey, Date.now());
                if (notice.id) seenAnnouncements.set(notice.id, Date.now());

                console.log(`[Upbit-Watcher] 🚀 NEW UPBIT LISTING DETECTED: ${notice.token} [${notice.markets.join(", ")}]`);

                const alertMessage = formatUpbitAlert(notice);
                await sendUpbitAlertToWhatsApp(notice, alertMessage);
            } catch (err: any) {
                console.error("[Upbit-Watcher] Error processing WebSocket message:", err?.message || err);
            }
        });

        activeWs.on("error", (err: Error) => {
            console.error("[Upbit-Watcher] ⚠️ WebSocket error:", err.message);
        });

        activeWs.on("close", (code: number, reason: Buffer) => {
            console.warn(`[Upbit-Watcher] 🔴 Connection closed (code=${code}). Scheduling reconnect...`);
            activeWs = null;
            scheduleReconnect();
        });
    } catch (err: any) {
        console.error("[Upbit-Watcher] ❌ Unexpected connection failure:", err?.message || err);
        scheduleReconnect();
    }
}

function scheduleReconnect(): void {
    if (isStopping || reconnectTimer) return;

    reconnectAttempts++;
    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(1.5, reconnectAttempts), RECONNECT_MAX_MS);
    console.log(`[Upbit-Watcher] ⏳ Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${reconnectAttempts})...`);

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectWebSocket();
    }, delay);
}

/**
 * Stops the watcher gracefully.
 */
export function stopUpbitListingWatcher(): void {
    isStopping = true;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (activeWs) {
        activeWs.removeAllListeners();
        activeWs.close();
        activeWs = null;
    }
    console.log("[Upbit-Watcher] ⏹️ Stopped.");
}
