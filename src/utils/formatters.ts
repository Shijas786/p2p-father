import type { Order } from "../types";

/**
 * Format a number as currency
 */
export function formatINR(amount: number): string {
    return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function formatTokenAmount(amount: number, token: string = "USDC"): string {
    const decimals = token === 'BNB' ? 4 : 2;
    return `${amount.toFixed(decimals)} ${token}`;
}

/**
 * Format an order for Telegram display
 */
export function formatOrder(order: Order, index?: number): string {
    const prefix = index !== undefined ? `${index + 1}\\.` : "•";
    const emoji = order.type === "sell" ? "🔴" : "🟢";
    const available = order.amount - (order.filled_amount || 0);

    return [
        `${prefix} ${emoji} *${order.type.toUpperCase()}* ${escapeMarkdown(formatTokenAmount(available, order.token))}`,
        `   Rate: ${escapeMarkdown(formatINR(order.rate))}/${escapeMarkdown(order.token || "USDC")}`,
        `   Total: ${escapeMarkdown(formatINR(available * order.rate))}`,
        `   Payment: ${escapeMarkdown(order.payment_methods?.join(", ") || "UPI")}`,
        `   Trader: @${escapeMarkdown(order.username || "anon")} (⭐ ${escapeMarkdown(order.trust_score?.toFixed(0) || "?")}%)`,
        `   ID: \`${order.id.slice(0, 8)}\``,
    ].join("\n");
}

/**
 * Format trade status with emoji
 */
export function formatTradeStatus(status: string): string {
    const map: Record<string, string> = {
        created: "📝 Created",
        matched: "🤝 Matched",
        in_escrow: "🔒 In Escrow",
        fiat_sent: "💸 Fiat Sent",
        fiat_confirmed: "✅ Fiat Confirmed",
        releasing: "⏳ Releasing",
        completed: "✅ Completed",
        disputed: "⚠️ Disputed",
        resolved: "⚖️ Resolved",
        refunded: "🔄 Refunded",
        cancelled: "❌ Cancelled",
        expired: "⏰ Expired",
    };
    return map[status] || status;
}

/**
 * Format time remaining
 */
export function formatTimeRemaining(deadline: string | Date): string {
    const now = new Date();
    const end = new Date(deadline);
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) return "⏰ Expired";

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (minutes > 60) {
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m ${seconds}s`;
}

/**
 * Format date to short string (DD/MM HH:mm)
 */
export function formatShortDate(date: string | Date): string {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${day}/${month} ${hours}:${minutes}`;
}

/**
 * Escape markdown special characters for Telegram
 */
export function escapeMarkdown(text: string): string {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string): string {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
