import WebSocket from "ws";
import https from "https";
import { env } from "../config/env";
import { hypermeowClient } from "../whatsapp/hypermeowClient";

const TREE_NEWS_WS_URL = "wss://news.treeofalpha.com/ws";
const TREE_NEWS_API_URL = "https://news.treeofalpha.com/api/news?limit=5";
const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 30000;
const FALLBACK_POLL_INTERVAL_MS = 60000;

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
 * Strictly blocks delistings, outages, marketing events, and impersonator accounts.
 */
export function parseUpbitListing(data: any): UpbitParsedNotice | null {
    if (!data || typeof data !== "object") return null;

    const source = (data.text || data.source || "").toString();
    const body = (data.body || data.title || "").toString();
    const combined = `${source} ${body}`;
    const combinedLower = combined.toLowerCase();

    const sourceLower = source.toLowerCase().trim();
    const linkLower = (data.link || data.url || "").toLowerCase().trim();
    const venueLower = (data.venue || "").toString().toLowerCase().trim();

    // 🛡️ STRICT AUTHENTICITY GUARD:
    // Only accept announcements originating from Upbit's verified X handles or official website.
    // Strictly blocks random Twitter accounts or scam impersonators (e.g. @Offlcial_Upbit).
    const tweetAuthorMatch = body.match(/^([^(:]+)\s*\(@([a-zA-Z0-9_]+)\)\s*:/);
    const tweetAuthorHandle = tweetAuthorMatch ? tweetAuthorMatch[2].toLowerCase() : "";
    const isOfficialTweetAuthor = tweetAuthorHandle === "official_upbit" || tweetAuthorHandle === "upbitglobal";

    const isOfficialUpbitSource =
        isOfficialTweetAuthor ||
        sourceLower === "official_upbit" ||
        sourceLower === "upbit" ||
        sourceLower === "upbitglobal" ||
        venueLower === "upbit" ||
        linkLower.includes("twitter.com/official_upbit") ||
        linkLower.includes("x.com/official_upbit") ||
        linkLower.includes("twitter.com/upbitglobal") ||
        linkLower.includes("x.com/upbitglobal") ||
        linkLower.includes("upbit.com/service_center/notice");

    if (!isOfficialUpbitSource) return null;

    // 🚫 EXCLUSION GUARD (Delistings, Outages, Maintenance, Airdrop Contests):
    // Upbit uses "거래지원 종료" for delistings, which contains "거래지원" (trading support).
    // We must strictly reject delistings, warnings, outages, and airdrop events.
    if (data.kind === "delisting" || data.kind === "outage" || data.kind === "airdrop") {
        return null;
    }

    const delistingKeywords = [
        "거래지원 종료",       // Trading support termination (delisting)
        "거래지원종료",
        "종료 안내",          // Termination notice
        "투자유의종목",        // Investment warning asset
        "지정 안내",          // Warning designation notice
        "연장 안내",          // Warning extension notice
        "delisting",
        "delist",
        "termination of support",
        "end of trading support"
    ];
    if (delistingKeywords.some((kw) => combinedLower.includes(kw))) {
        return null;
    }

    // 2. Must be a verified listing announcement (Korean or English)
    const isTreeListingTag = data.kind === "listing";
    const listingKeywords = [
        "market support",     // Upbit English tweets: "Market Support for ..."
        "trading support",    // "Trading Support Guide"
        "supported markets",  // Upbit English tweets: "Supported Markets: ..."
        "trading opens at",   // Schedule line in tweet
        "trading open",
        "신규 거래지원",      // New trading support (standard Korean listing title)
        "거래지원 안내",      // Trading support notice
        "신규 디지털 자산",   // New digital asset
        "마켓 추가",          // Market addition (e.g. KRW 마켓 추가)
        "신규 상장",          // New listing
        "market added",
        "new listing"
    ];

    const isListing = isTreeListingTag || listingKeywords.some((kw) => combinedLower.includes(kw));
    if (!isListing) return null;

    // 3. Detect markets supported (KRW fiat, BTC, USDT) using word boundaries
    const markets: string[] = [];
    if (/\bkrw\b|원화/i.test(combined)) markets.push("KRW");
    if (/\bbtc\b/i.test(combined)) markets.push("BTC");
    if (/\busdt\b/i.test(combined)) markets.push("USDT");

    // 4. Extract token symbol (Tree News coins array -> Parentheses -> Hashtags -> Dash)
    let token = "";
    if (Array.isArray(data.coins) && data.coins.length > 0) {
        const first = data.coins[0];
        const sym = typeof first === "string" ? first : first?.symbol;
        if (sym && !["KRW", "BTC", "USDT"].includes(sym.toUpperCase())) {
            token = sym.toUpperCase();
        }
    }

    if (!token) {
        // A. Check parentheses in notice title: Robotics(AXIS) or (AXIS)
        // Note: multiple parentheses can exist, e.g. "신규 거래지원 안내 (BTC) - 솔라나(SOL)"
        const parenMatches = [...combined.matchAll(/\(([A-Z0-9]{2,10})\)/g)];
        const foundParen = parenMatches
            .map((m) => m[1].toUpperCase())
            .find((sym) => !["KRW", "BTC", "USDT", "MARKET"].includes(sym));
        if (foundParen) {
            token = foundParen;
        }
    }

    if (!token) {
        // B. Check hashtags from Upbit X tweets (e.g. #Upbit #AXIS)
        const hashtagMatches = combined.match(/#([A-Z0-9]{2,10})\b/gi);
        if (hashtagMatches) {
            const foundTag = hashtagMatches
                .map((h: string) => h.replace("#", "").toUpperCase())
                .find((h: string) => !["UPBIT", "KRW", "BTC", "USDT", "CRYPTO", "NOTICE", "MARKET"].includes(h));
            if (foundTag) token = foundTag;
        }
    }

    if (!token) {
        // C. Check dash or colon: e.g. - AXIS or : AXIS
        const dashMatch = combined.match(/[-:]\s*([A-Z0-9]{2,10})\b/);
        if (dashMatch && !["KRW", "BTC", "USDT", "MARKET"].includes(dashMatch[1].toUpperCase())) {
            token = dashMatch[1].toUpperCase();
        }
    }

    const uniqueId = String(data._id || data.id || `${token || "UPBIT"}_${markets.join("_")}_${Date.now()}`);
    const rawLink = String(data.link || data.url || "").trim().replace(/#$/, "");

    const isFromX =
        rawLink.includes("twitter.com") ||
        rawLink.includes("x.com") ||
        rawLink.includes("t.co/") ||
        isOfficialTweetAuthor ||
        sourceLower.includes("official_upbit");

    const isTweetUrl =
        rawLink.includes("twitter.com") ||
        rawLink.includes("x.com") ||
        rawLink.includes("t.co/");

    // Extract direct upbit link from body if present (e.g. from English / Korean tweet)
    const directNoticeMatch = body.match(/https?:\/\/(?:www\.)?upbit\.com\/[^\s)\]]+/);
    let noticeUrl = directNoticeMatch
        ? directNoticeMatch[0].replace(/[.,;:!?]+$/, "")
        : rawLink.includes("upbit.com")
        ? rawLink
        : "https://upbit.com/service_center/notice";

    // 🛡️ Fix broken timestamp placeholder URLs: Tree News often appends a 10+ digit timestamp as ?id=1792...
    // Real Upbit notice IDs are small sequential numbers (e.g. ?id=4821).
    // Timestamps cause a 404, so point directly to the live Upbit notice board where the new listing is pinned at the top.
    if (/service_center\/notice\?id=\d{10,}/.test(noticeUrl)) {
        noticeUrl = "https://upbit.com/service_center/notice";
    }

    const tweetUrl = isTweetUrl ? rawLink : undefined;

    // Extract trading start time if present (e.g. 2026-10-21 22:00 KST)
    const timeMatch = combined.match(/(?:Trading (?:Support Start Time|opens at)|Start Time|거래지원 개시(?: 시점)?)\s*[:：]?\s*([^\n\r]+)/i);
    let tradingOpensAt = timeMatch ? timeMatch[1].trim() : undefined;
    if (tradingOpensAt) {
        tradingOpensAt = tradingOpensAt.replace(/^(?:Scheduled for\s*)/i, "").trim();
    }

    // Extract project Twitter handle if present (e.g. @axisrobotics)
    const projectHandleMatch = combined.match(/@([a-zA-Z0-9_]+)/g);
    const projectHandle = projectHandleMatch?.find(
        (h) => !h.toLowerCase().includes("upbit")
    );

    // Extract poster image if attached and valid HTTP URL
    const rawImage = (data.image || data.media || data.imageUrl || "")?.toString().trim();
    const imageUrl = rawImage && /^https?:\/\//i.test(rawImage) ? rawImage : undefined;

    return {
        id: uniqueId,
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
        timestamp: data.ts || data.time || Date.now()
    };
}

/**
 * Formats a high-visibility WhatsApp alert message.
 */
export function formatUpbitAlert(notice: UpbitParsedNotice): string {
    const krwBadge = notice.isKrw ? "\n\n🔥 *KRW FIAT PAIR LISTED! (HIGH VOLATILITY)*" : "";
    const tokenDisplay = notice.projectHandle ? `${notice.token} (${notice.projectHandle})` : notice.token;

    let detailsBlock = `🪙 *Token:* ${tokenDisplay}`;
    if (notice.markets && notice.markets.length > 0) {
        detailsBlock += `\n📈 *Markets:* ${notice.markets.join(" / ")}`;
    }
    if (notice.tradingOpensAt) {
        detailsBlock += `\n⏰ *Trading Opens:* ${notice.tradingOpensAt}`;
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

export interface BinanceParsedNotice {
    id: string;
    tokens: string;
    rawTitle: string;
    noticeUrl: string;
    tweetUrl?: string;
    isFromX: boolean;
    tradingOpensAt?: string;
    hasSeedTag: boolean;
    imageUrl?: string;
    timestamp: number;
}

/**
 * Checks if incoming news payload is a Binance Spot listing notice.
 * Strictly filters out Futures perps, margin-only additions, delistings, and marketing contests.
 */
export function parseBinanceListing(data: any): BinanceParsedNotice | null {
    if (!data || typeof data !== "object") return null;

    const source = (data.text || data.source || "").toString();
    const body = (data.body || data.title || "").toString();
    const combined = `${source} ${body}`;
    const combinedLower = combined.toLowerCase();

    const sourceLower = source.toLowerCase().trim();
    const linkLower = (data.link || data.url || "").toLowerCase().trim();
    const venueLower = (data.venue || "").toString().toLowerCase().trim();

    // 1. Authenticity check: Must be official Binance
    const tweetAuthorMatch = body.match(/^([^(:]+)\s*\(@([a-zA-Z0-9_]+)\)\s*:/);
    const tweetAuthorHandle = tweetAuthorMatch ? tweetAuthorMatch[2].toLowerCase() : "";
    const isOfficialTweet = tweetAuthorHandle === "binance";

    const isOfficialBinance =
        isOfficialTweet ||
        sourceLower.includes("binance en") ||
        sourceLower.includes("binance zh") ||
        sourceLower === "binance" ||
        venueLower === "binance" ||
        linkLower.includes("binance.com/en/support/announcement") ||
        linkLower.includes("x.com/binance") ||
        linkLower.includes("twitter.com/binance");

    if (!isOfficialBinance) return null;

    // 2. Strict exclusion of Futures, Margin-only, Delistings, Contests, Outages
    if (data.kind === "delisting" || data.kind === "outage" || data.kind === "airdrop") {
        return null;
    }

    const exclusionKeywords = [
        "futures will launch",
        "futures will list",
        "perpetual contract",
        "usdⓈ-m",
        "coin-m",
        "perpetuals",
        "will delist",
        "delisting",
        "delist",
        "tournament",
        "competition",
        "giveaway",
        "reward",
        "promotion",
        "fee discount"
    ];
    if (exclusionKeywords.some((kw) => combinedLower.includes(kw))) {
        return null;
    }

    // 3. Must be a SPOT listing announcement
    const isSpotListing =
        combinedLower.includes("will list") ||
        combinedLower.includes("new spot listing") ||
        (combinedLower.includes("adds") && combinedLower.includes("spot")) ||
        combinedLower.includes("spot trading pairs") ||
        combinedLower.includes("seed tag applied") ||
        combinedLower.includes("innovation zone") ||
        (data.kind === "listing" && !combinedLower.includes("futures"));

    if (!isSpotListing) return null;

    // 4. Extract token symbols
    const tokens: string[] = [];

    // A. Check parentheses in title: e.g. "Peanut the Squirrel (PNUT)"
    const parenMatches = [...combined.matchAll(/\(([A-Z0-9]{2,10})\)/g)];
    parenMatches.forEach((m) => {
        const sym = m[1].toUpperCase();
        if (!["USDT", "BTC", "BNB", "FDUSD", "EUR", "TRY", "USDC", "SPOT", "DETAIL", "UTC"].includes(sym)) {
            if (!tokens.includes(sym)) tokens.push(sym);
        }
    });

    // B. Check cash tags like $PNUT in tweet
    const cashtagMatches = combined.match(/\$([A-Z0-9]{2,10})\b/gi);
    if (cashtagMatches) {
        cashtagMatches.forEach((c) => {
            const sym = c.replace("$", "").toUpperCase();
            if (!["USDT", "BTC", "BNB", "FDUSD", "BINANCE"].includes(sym)) {
                if (!tokens.includes(sym)) tokens.push(sym);
            }
        });
    }

    const primaryToken = tokens.length > 0 ? tokens.map((t) => `$${t}`).join(", ") : "New Token";
    const uniqueId = String(data._id || data.id || `BINANCE_${tokens.join("_")}_${Date.now()}`);
    const rawLink = String(data.link || data.url || "").trim().replace(/#$/, "");

    // Notice URL & Tweet URL
    const directNoticeMatch = body.match(/https?:\/\/(?:www\.)?binance\.com\/[^\s)\]]+/);
    const noticeUrl = directNoticeMatch
        ? directNoticeMatch[0].replace(/[.,;:!?]+$/, "")
        : rawLink.includes("binance.com")
        ? rawLink
        : "https://www.binance.com/en/support/announcement";

    const isTweetUrl = rawLink.includes("twitter.com") || rawLink.includes("x.com");
    const tweetUrl = isTweetUrl ? rawLink : undefined;

    // Trading opens at
    const timeMatch = combined.match(/(?:Trading opens at|open trading for[^\n\r]+at)\s*[:：]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2}(?:\s*\([A-Z]+\))?|[^\n\r.]+)/i);
    const tradingOpensAt = timeMatch ? timeMatch[1].trim() : undefined;

    const hasSeedTag = combinedLower.includes("seed tag");

    // Poster image
    const rawImage = (data.image || data.media || data.imageUrl || "")?.toString().trim();
    const imageUrl = rawImage && /^https?:\/\//i.test(rawImage) ? rawImage : undefined;

    return {
        id: uniqueId,
        tokens: primaryToken,
        rawTitle: body || source,
        noticeUrl,
        tweetUrl,
        isFromX: isTweetUrl || isOfficialTweet,
        tradingOpensAt,
        hasSeedTag,
        imageUrl,
        timestamp: data.ts || data.time || Date.now()
    };
}

/**
 * Formats a high-visibility Binance Spot listing alert message.
 */
export function formatBinanceAlert(notice: BinanceParsedNotice): string {
    const seedTagBadge = notice.hasSeedTag ? "\n🏷️ *Seed Tag Applied (High Volatility)*" : "";

    let detailsBlock = `🪙 *Token:* ${notice.tokens}`;
    if (notice.tradingOpensAt) {
        detailsBlock += `\n⏰ *Trading Opens:* ${notice.tradingOpensAt}`;
    }

    let linksBlock = `🔗 *Official Notice:* ${notice.noticeUrl}`;
    if (notice.tweetUrl && notice.tweetUrl !== notice.noticeUrl) {
        linksBlock += `\n🐦 *Tweet Link:* ${notice.tweetUrl}`;
    }

    return `🚨 *BINANCE NEW SPOT LISTING!* 🚨\n\n🔥 *TIER-1 EXCHANGE SPOT LISTING!*${seedTagBadge}\n${detailsBlock}\n\n${linksBlock}\n\n⚡ *P2P Father Market Watch*`;
}

/**
 * Sends a listing alert message to the official WhatsApp community group.
 * Sends image poster if available with caption, otherwise clean text.
 */
export async function sendAlertToWhatsApp(notice: { imageUrl?: string }, message: string, exchange: string): Promise<boolean> {
    const officialGroupJid = env.WA_OFFICIAL_GROUP_JID || "120363410362268845@g.us";
    try {
        if (notice.imageUrl) {
            console.log(`[${exchange}-Watcher] 📸 Attempting image alert dispatch with: ${notice.imageUrl}`);
            const imageSent = await hypermeowClient.sendImage(officialGroupJid, notice.imageUrl, message);
            if (imageSent) {
                console.log(`[${exchange}-Watcher] ✅ Dispatched listing image alert to group: ${officialGroupJid}`);
                return true;
            }
        }

        const success = await hypermeowClient.sendText(officialGroupJid, message);
        if (success) {
            console.log(`[${exchange}-Watcher] ✅ Dispatched listing text alert to group: ${officialGroupJid}`);
            return true;
        } else {
            console.warn(`[${exchange}-Watcher] ⚠️ SendText returned false for ${officialGroupJid}`);
        }
    } catch (err: any) {
        console.error(`[${exchange}-Watcher] ❌ Error sending alert to WhatsApp group:`, err?.message || err);
    }
    return false;
}

export async function sendUpbitAlertToWhatsApp(notice: UpbitParsedNotice, message: string): Promise<boolean> {
    return sendAlertToWhatsApp(notice, message, "Upbit");
}

let activeWs: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let pingInterval: NodeJS.Timeout | null = null;
let pollInterval: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
let isStopping = false;

function clearHeartbeat(): void {
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
}

function startHeartbeat(ws: WebSocket): void {
    clearHeartbeat();
    (ws as any).isAlive = true;

    ws.on("pong", () => {
        (ws as any).isAlive = true;
    });

    pingInterval = setInterval(() => {
        if (!activeWs || activeWs.readyState !== WebSocket.OPEN) {
            clearHeartbeat();
            return;
        }
        if ((activeWs as any).isAlive === false) {
            console.warn("[Upbit-Watcher] ⚠️ WebSocket heartbeat timed out (zombie connection). Terminating for reconnect...");
            clearHeartbeat();
            try {
                activeWs.terminate();
            } catch {
                // ignore
            }
            return;
        }
        (activeWs as any).isAlive = false;
        try {
            activeWs.ping();
        } catch {
            // ignore
        }
    }, HEARTBEAT_INTERVAL_MS);
}

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
    startFallbackPoller();
}

function connectWebSocket(): void {
    if (isStopping) return;

    console.log(`[Upbit-Watcher] 🔌 Connecting to Tree News stream (${TREE_NEWS_WS_URL})...`);

    try {
        activeWs = new WebSocket(TREE_NEWS_WS_URL);

        activeWs.on("open", () => {
            console.log("[Upbit-Watcher] 🟢 Connected to Tree News stream! Monitoring Upbit listings 24/7.");
            reconnectAttempts = 0;
            if (activeWs) {
                startHeartbeat(activeWs);
            }

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
                await processIncomingNewsPayload(payload, "WebSocket");
            } catch (err: any) {
                console.error("[Upbit-Watcher] Error processing WebSocket message:", err?.message || err);
            }
        });

        activeWs.on("error", (err: Error) => {
            console.error("[Upbit-Watcher] ⚠️ WebSocket error:", err.message);
        });

        activeWs.on("close", (code: number) => {
            console.warn(`[Upbit-Watcher] 🔴 Connection closed (code=${code}). Scheduling reconnect...`);
            clearHeartbeat();
            activeWs = null;
            scheduleReconnect();
        });
    } catch (err: any) {
        console.error("[Upbit-Watcher] ❌ Unexpected connection failure:", err?.message || err);
        clearHeartbeat();
        scheduleReconnect();
    }
}

// 🛡️ ANTI-SPAM & CIRCUIT BREAKER GUARDS:
// Crucial for WhatsApp: Prevents duplicate messages, spam loops, or rapid bursts from endangering the WA account.
const MIN_ALERT_INTERVAL_MS = 5000; // Minimum 5 seconds between consecutive listing alerts
const MAX_ALERTS_PER_MINUTE = 3;    // Maximum 3 alerts in any rolling 60-second window
let lastAlertSentTime = 0;
const recentAlertTimestamps: number[] = [];
let circuitBreakerTrippedUntil = 0;

function canDispatchAlert(): { allowed: boolean; reason?: string } {
    const now = Date.now();
    if (now < circuitBreakerTrippedUntil) {
        return {
            allowed: false,
            reason: `Circuit breaker active until ${new Date(circuitBreakerTrippedUntil).toISOString()} (burst storm protection)`
        };
    }

    if (now - lastAlertSentTime < MIN_ALERT_INTERVAL_MS) {
        return {
            allowed: false,
            reason: `Cooldown active (< ${MIN_ALERT_INTERVAL_MS / 1000}s since last alert)`
        };
    }

    while (recentAlertTimestamps.length > 0 && recentAlertTimestamps[0] < now - 60000) {
        recentAlertTimestamps.shift();
    }

    if (recentAlertTimestamps.length >= MAX_ALERTS_PER_MINUTE) {
        circuitBreakerTrippedUntil = now + 3 * 60 * 1000; // Trip for 3 minutes
        console.warn("[Listing-Watcher] 🛑 CIRCUIT BREAKER TRIPPED: >=3 alerts dispatched in 60s. Halting for 3 mins to protect WhatsApp account from ban.");
        return {
            allowed: false,
            reason: "Circuit breaker tripped (burst rate limit reached)"
        };
    }

    return { allowed: true };
}

function recordAlertDispatched(): void {
    const now = Date.now();
    lastAlertSentTime = now;
    recentAlertTimestamps.push(now);
}

async function processIncomingNewsPayload(payload: any, channel: "WebSocket" | "Poller"): Promise<void> {
    // 1. Check if it is an Upbit new listing
    const upbitNotice = parseUpbitListing(payload);
    if (upbitNotice) {
        pruneSeenAnnouncements();

        // Multi-key deduplication (Token + Announcement ID + URLs)
        const cleanToken = upbitNotice.token.replace("$", "").toUpperCase();
        const tokenKey = `UPBIT_TOKEN_${cleanToken}`;
        const idKey = `UPBIT_ID_${upbitNotice.id}`;
        const urlKey = `URL_${upbitNotice.noticeUrl}`;
        const tweetKey = upbitNotice.tweetUrl ? `URL_${upbitNotice.tweetUrl}` : null;

        const isDuplicate =
            (cleanToken !== "NEW ASSET" && seenAnnouncements.has(tokenKey)) ||
            seenAnnouncements.has(idKey) ||
            seenAnnouncements.has(urlKey) ||
            (tweetKey && seenAnnouncements.has(tweetKey));

        if (isDuplicate) {
            console.log(`[Listing-Watcher] ⏭️ Dropping duplicate Upbit notice for ${upbitNotice.token}`);
            return;
        }

        const throttle = canDispatchAlert();
        if (!throttle.allowed) {
            console.warn(`[Listing-Watcher] ⚠️ Blocked Upbit alert dispatch for ${upbitNotice.token}: ${throttle.reason}`);
            return;
        }

        // Mark all keys as seen synchronously BEFORE dispatching
        const now = Date.now();
        if (cleanToken !== "NEW ASSET") seenAnnouncements.set(tokenKey, now);
        seenAnnouncements.set(idKey, now);
        seenAnnouncements.set(urlKey, now);
        if (tweetKey) seenAnnouncements.set(tweetKey, now);

        console.log(`[Listing-Watcher] 🚀 NEW UPBIT LISTING DETECTED via ${channel}: ${upbitNotice.token} [${upbitNotice.markets.join(", ")}]`);

        const alertMessage = formatUpbitAlert(upbitNotice);
        const dispatched = await sendAlertToWhatsApp(upbitNotice, alertMessage, "Upbit");
        if (dispatched) {
            recordAlertDispatched();
        }
        return;
    }

    // 2. Check if it is a Binance Spot listing
    const binanceNotice = parseBinanceListing(payload);
    if (binanceNotice) {
        pruneSeenAnnouncements();

        // Multi-key deduplication (Tokens + Announcement ID + URLs)
        const cleanTokens = binanceNotice.tokens.replace(/[\s$]/g, "").toUpperCase();
        const tokensKey = `BINANCE_TOKENS_${cleanTokens}`;
        const idKey = `BINANCE_ID_${binanceNotice.id}`;
        const urlKey = `URL_${binanceNotice.noticeUrl}`;
        const tweetKey = binanceNotice.tweetUrl ? `URL_${binanceNotice.tweetUrl}` : null;

        const isDuplicate =
            (cleanTokens !== "NEWTOKEN" && seenAnnouncements.has(tokensKey)) ||
            seenAnnouncements.has(idKey) ||
            seenAnnouncements.has(urlKey) ||
            (tweetKey && seenAnnouncements.has(tweetKey));

        if (isDuplicate) {
            console.log(`[Listing-Watcher] ⏭️ Dropping duplicate Binance notice for ${binanceNotice.tokens}`);
            return;
        }

        const throttle = canDispatchAlert();
        if (!throttle.allowed) {
            console.warn(`[Listing-Watcher] ⚠️ Blocked Binance alert dispatch for ${binanceNotice.tokens}: ${throttle.reason}`);
            return;
        }

        // Mark all keys as seen synchronously BEFORE dispatching
        const now = Date.now();
        if (cleanTokens !== "NEWTOKEN") seenAnnouncements.set(tokensKey, now);
        seenAnnouncements.set(idKey, now);
        seenAnnouncements.set(urlKey, now);
        if (tweetKey) seenAnnouncements.set(tweetKey, now);

        console.log(`[Listing-Watcher] 🚀 NEW BINANCE SPOT LISTING DETECTED via ${channel}: ${binanceNotice.tokens}`);

        const alertMessage = formatBinanceAlert(binanceNotice);
        const dispatched = await sendAlertToWhatsApp(binanceNotice, alertMessage, "Binance");
        if (dispatched) {
            recordAlertDispatched();
        }
        return;
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
 * Lightweight 60-second background poller as a fail-safe catch-up mechanism.
 * Ensures zero missed announcements if the WebSocket experiences a network glitch.
 */
function startFallbackPoller(): void {
    if (pollInterval) return;

    pollInterval = setInterval(async () => {
        if (isStopping) return;
        try {
            https.get(TREE_NEWS_API_URL, (res) => {
                if (res.statusCode !== 200) return;
                let raw = "";
                res.on("data", (chunk) => (raw += chunk));
                res.on("end", async () => {
                    try {
                        const items = JSON.parse(raw);
                        if (Array.isArray(items)) {
                            for (const item of items) {
                                await processIncomingNewsPayload(item, "Poller");
                            }
                        }
                    } catch {
                        // ignore JSON parse errors
                    }
                });
            }).on("error", () => {
                // ignore network glitches
            });
        } catch {
            // ignore
        }
    }, FALLBACK_POLL_INTERVAL_MS);
}

/**
 * Stops the watcher gracefully.
 */
export function stopUpbitListingWatcher(): void {
    isStopping = true;
    clearHeartbeat();

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
    if (activeWs) {
        activeWs.removeAllListeners();
        try {
            activeWs.close();
        } catch {
            // ignore
        }
        activeWs = null;
    }
    console.log("[Upbit-Watcher] ⏹️ Stopped.");
}
