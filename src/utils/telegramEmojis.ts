import { getQualifyingVIPConfig } from "../config/feeCashback";

// ─── Custom Telegram Emojis for Broadcasts ────────────────────────────────────
export const TG_CUSTOM_EMOJIS = {
    KYC: [
        "5424875446711887339",
        "5424605254614262924",
        "5427295974315793487",
    ],
    VIP: "5449849414522774647",
    BNB_CHAIN: "5280763862113592324",
    BASE_CHAIN: "5289856483972912387",
    USDT: "5345889288741461772",
    USDC: "5343662197874630855",
    SCAN: "5287641590813200932",
    LOCKED: "5449621648112100255",
    CELEBRATION: [
        "5237899560218534031",
        "5237968923940364244",
        "5195357093107868151",
        "5235714190664016775",
    ],
} as const;

export function stripTgCustomEmojis(text: string): string {
    return text.replace(/<tg-emoji[^>]*>(.*?)<\/tg-emoji>/gi, "$1");
}

export function tgCustomEmoji(emojiId: string, fallback: string): string {
    return `<tg-emoji emoji-id="${emojiId}">${fallback}</tg-emoji>`;
}

export function getRandomCelebrationEmoji(): string {
    const list = TG_CUSTOM_EMOJIS.CELEBRATION;
    const id = list[Math.floor(Math.random() * list.length)];
    return tgCustomEmoji(id, "🎉");
}

export function getRandomKycEmoji(): string {
    const list = TG_CUSTOM_EMOJIS.KYC;
    const id = list[Math.floor(Math.random() * list.length)];
    return tgCustomEmoji(id, "🛡️");
}

export function getTokenCustomEmoji(token: string): string {
    const t = (token || "").toUpperCase();
    if (t === "USDT") return tgCustomEmoji(TG_CUSTOM_EMOJIS.USDT, "💵");
    if (t === "USDC") return tgCustomEmoji(TG_CUSTOM_EMOJIS.USDC, "💲");
    return "";
}

export function getChainCustomEmoji(chain: string): string {
    const c = (chain || "").toLowerCase();
    if (c.includes("bsc") || c.includes("bnb")) return tgCustomEmoji(TG_CUSTOM_EMOJIS.BNB_CHAIN, "🟡");
    if (c.includes("base")) return tgCustomEmoji(TG_CUSTOM_EMOJIS.BASE_CHAIN, "🔵");
    return "🔗";
}

export function getTraderBadges(user: any, order?: any): string {
    const isVerified = Boolean(
        user?.is_verified ||
        user?.kyc_status === "approved" ||
        order?.is_verified ||
        order?.users?.is_verified ||
        order?.users?.kyc_status === "approved"
    );

    const isVip = Boolean(
        user?.tier === "vip" ||
        user?.is_vip ||
        order?.users?.tier === "vip" ||
        order?.tier === "vip" ||
        (user?.username && getQualifyingVIPConfig(user.telegram_id, user.username, Date.now())) ||
        (order?.username && getQualifyingVIPConfig(order.telegram_id || order.user_id, order.username, Date.now()))
    );

    let badges = "";
    if (isVerified) {
        badges += `KYC ${getRandomKycEmoji()}`;
    }
    if (isVip) {
        badges += (badges ? " " : "") + tgCustomEmoji(TG_CUSTOM_EMOJIS.VIP, "👑");
    }
    return badges ? ` ${badges}` : "";
}
