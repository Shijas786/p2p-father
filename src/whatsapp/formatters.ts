/**
 * P2PFather WhatsApp Message Formatter
 * All WhatsApp message templates live here for easy editing.
 *
 * WhatsApp bold:   *text*
 * WhatsApp italic: _text_
 * WhatsApp mono:   ```text```
 */

import type { Order, Trade, User } from "../types";

const BOT_NUMBER = (process.env.WA_BOT_NUMBER || "917012751478").replace(/[^0-9]/g, "");

/** Deep link into private DM to start a specific action */
export function waLink(text: string): string {
    return `https://wa.me/${BOT_NUMBER}?text=${encodeURIComponent(text)}`;
}

// ─── Main Menu ────────────────────────────────────────────────────────────────
const DIVIDER = "━━━━━━━━━━━━━━━━━━━━";
export const MAIN_MENU = `🤖 *P2PFather — Crypto P2P Exchange*

${DIVIDER}
1️⃣ 💰 Balance & Wallet
2️⃣ 📊 Browse P2P Ads
3️⃣ ➕ Post New Ad
4️⃣ 📋 My Active Trades
5️⃣ 📋 My Ads
${DIVIDER}
Also: /deposit · /send · /profile · /help

_Reply with a number 1–5 or type any command ↓_`;

// ─── Wallet ───────────────────────────────────────────────────────────────────
export function fmtWalletBalance(
    user: User,
    balances: { token: string; amount: string }[]
): string {
    const address = user.wallet_address ?? "Not set";
    const shortAddr = address !== "Not set"
        ? `${address.slice(0, 6)}...${address.slice(-4)}`
        : "Not set";

    const balanceLines = balances.length > 0
        ? balances.map((b) => `  • *${b.token}:* ${b.amount}`).join("\n")
        : "  _No balance found. Please deposit first._";

    return `💰 *YOUR P2PFATHER WALLET*

*Address:* \`${shortAddr}\`

*Balances:*
${balanceLines}

📥 *To deposit:* /deposit
📤 *To send:* /send
📊 *To trade:* /ads`;
}

export function formatOrderLimits(order: any): string {
    if (!order) return "₹100–₹50,000";
    const rate = parseFloat(order.rate || "0");
    const amount = parseFloat(order.amount || "0");
    const totalFiat = Math.round(amount * rate);

    const min = order.min_amount != null && order.min_amount > 0 ? order.min_amount : 100;
    const max = order.max_amount != null && order.max_amount > 0
        ? order.max_amount
        : (totalFiat > 0 ? totalFiat : 50000);

    return `₹${min.toLocaleString()}–₹${max.toLocaleString()}`;
}

export function formatTraderContact(user: any): string {
    if (!user) return "Verified Trader";
    const parts: string[] = [];
    if (user.whatsapp_phone || user.phone_number) {
        const phone = String(user.whatsapp_phone || user.phone_number).replace("+", "").trim();
        if (phone) parts.push(`@${phone}`);
    }
    if (user.username) {
        parts.push(`@${user.username}`);
    }
    if (parts.length > 0) {
        return parts.join(" (") + (parts.length > 1 ? ")" : "");
    }
    return user.first_name ? user.first_name : "Verified Trader";
}

export function fmtDepositAddress(user: User): string {
    const address = user.wallet_address ?? "Contact support";
    return `📥 *DEPOSIT CRYPTO*

Send USDT/BNB/MATIC to your personal deposit address:

\`\`\`${address}\`\`\`

⚠️ *Important:*
  • Only send on supported chains (BSC, Polygon, Base)
  • Minimum deposit: 1 USDT
  • Funds arrive automatically within 1-2 minutes

_QR code sent above ↑_`;
}

// ─── Orders / Ads ─────────────────────────────────────────────────────────────
export function fmtOrderList(orders: any[], type: string): string {
    if (orders.length === 0) {
        return `📊 *No active ${type.toUpperCase()} ads found right now.*\n\nBe the first! Post an ad with /post`;
    }

    const lines = orders.map((o, i) => {
        const traderName = formatTraderContact(o.users);
        const trust = o.users?.trust_score ?? 0;
        const payMethods = (o.payment_methods ?? []).join(", ");
        const limits = formatOrderLimits(o);
        const link = waLink(`trade_ad_${o.id}`);

        return `${i + 1}️⃣ *Rate: ₹${o.rate}* | Limit: ${limits}
   👤 ${traderName} (Score: ${trust}% ⭐) | ${payMethods}
   👉 *Trade Now:* ${link}`;
    });

    return `📊 *LIVE ${type.toUpperCase()} USDT ADS*\n\n${lines.join("\n\n")}\n\n_Tap a link to open private chat & start escrow trade_`;
}

export function fmtMyAds(orders: any[]): string {
    if (orders.length === 0) {
        return `📋 *You have no active ads.*\n\nPost one now with /post`;
    }

    const lines = orders.map((o, i) => {
        const status = o.status === "active" ? "🟢 Active" : `⏸ ${o.status}`;
        const limits = formatOrderLimits(o);
        return `${i + 1}. *${o.type.toUpperCase()} ${o.token}* @ ₹${o.rate} | ${status}
   Limits: ${limits}
   ▸ Delete: /delete_ad_${o.id}
   ▸ Pause: /pause_ad_${o.id}`;
    });

    return `📋 *YOUR P2P ADS*\n\n${lines.join("\n\n")}`;
}

// ─── Trade ────────────────────────────────────────────────────────────────────
export function fmtTradeStarted(trade: Trade, role: "buyer" | "seller", sellerName: string, buyerName: string): string {
    if (role === "buyer") {
        return `🤝 *TRADE MATCHED!*

You are *BUYING* ${trade.buyer_receives} USDT
• *Rate:* ₹${trade.rate}
• *You Pay:* ₹${trade.fiat_amount} (${trade.payment_method})
• *Seller:* ${sellerName}
• *Trade ID:* \`${trade.id.slice(0, 8)}\`

⏳ USDT is locked in escrow. Please transfer ₹${trade.fiat_amount} to the seller now.

Once paid, reply: /paid_${trade.id}`;
    }

    return `🤝 *TRADE MATCHED!*

You are *SELLING* ${trade.amount} USDT
• *Rate:* ₹${trade.rate}
• *Buyer Pays:* ₹${trade.fiat_amount} (${trade.payment_method})
• *Buyer:* ${buyerName}
• *Trade ID:* \`${trade.id.slice(0, 8)}\`

✅ USDT locked in escrow. Wait for the buyer to transfer ₹${trade.fiat_amount}.

Once you receive payment → /release_${trade.id}
Issue? → /dispute_${trade.id}`;
}

export function fmtEscrowLocked(trade: Trade): string {
    return `🔒 *ESCROW LOCKED!*

✅ ${trade.amount} USDT locked in smart contract escrow.
• *Escrow TX:* \`${(trade.escrow_tx_hash ?? "pending").slice(0, 20)}...\`
• *Auto-release in:* 45 minutes if buyer marks payment

Buyer must pay ₹${trade.fiat_amount} now.`;
}

export function fmtPaymentMarked(trade: Trade): string {
    return `💸 *PAYMENT MARKED SENT*

Buyer has marked ₹${trade.fiat_amount} as sent.

⚠️ *Please verify your bank account NOW.*

Once verified → /release_${trade.id}
Problem? → /dispute_${trade.id}

_Do NOT release until you confirm the money arrived!_`;
}

export function fmtTradeReleased(trade: any): string {
    const amount = trade.amount || trade.buyer_receives || 0;
    const token = trade.token || "USDT";
    const totalFiat = Math.round(amount * (trade.rate || 0));
    const chain = (trade.chain || "base").toUpperCase();
    const seller = trade.seller_name || "Seller";
    const buyer = trade.buyer_name || "Buyer";

    return `🎉 *Trade Completed!*

*${seller}* sold *${amount} ${token}* to *${buyer}*
💰 Deal: ₹${totalFiat.toLocaleString("en-IN")}
🔗 Chain: ${chain}

✅ Escrowed & settled on-chain
⚡ Trade safe with P2PFather`;
}

export function fmtDisputeOpened(trade: Trade): string {
    return `⚠️ *DISPUTE OPENED*

Trade \`${trade.id.slice(0, 8)}\` is now under admin review.

*Next steps:*
  1. Upload payment proof screenshots in this chat
  2. Admin will review within 24 hours
  3. Decision is final and enforced by smart contract

Support: @P2PFatherSupport`;
}

// ─── Group Live Ad Broadcast (Exact Telegram Style) ───────────────────────────
export function fmtGroupAdBroadcast(order: any): string {
    const isSell = order.type === "sell";
    const header = isSell ? "📢 *New SELL Ad!*" : "📢 *New BUY Ad!*";
    const emoji = isSell ? "🔴" : "🟢";

    const trader = formatTraderContact(order.users);
    const isVerified = order.users?.is_verified || order.users?.kyc_status === 'approved';
    const verifiedBadge = isVerified ? " [✅ Verified]" : "";
    const actionVerb = isSell ? "wants to sell" : "wants to buy";

    const amount = order.amount || 0;
    const rate = order.rate || 0;
    const token = order.token || "USDT";
    const totalFiat = Math.round(amount * rate);
    const chain = (order.chain || "base").toUpperCase();
    const payMethods = (order.payment_methods ?? []).join(", ") || "UPI";
    const link = waLink(`trade_ad_${order.id}`);

    const orderLine = `${emoji} *${trader}*${verifiedBadge} ${actionVerb} *${amount} ${token}*`;
    const rateLine = `💰 Rate: ₹${rate.toLocaleString()}/${token}`;
    const totalLine = `🧾 Total: ₹${totalFiat.toLocaleString("en-IN")}`;
    const chainLine = `🔗 Chain: ${chain}`;
    const paymentLine = `💳 Payment: ${payMethods}`;

    return `${header}

${orderLine}
${rateLine}
${totalLine}
${chainLine}
${paymentLine}

👉 *Start Trade in Private DM:*
${link}

_All trades are smart-contract escrow protected 🔒_`;
}

export function fmtGroupLiveAds(orders: any[], type: "buy" | "sell" | "all"): string {
    if (orders.length === 0) {
        return `📊 *No live ${type === "all" ? "" : type.toUpperCase() + " "}ads right now.*\nCheck back soon or post an ad: ${waLink("post_ad")}`;
    }

    const header = type === "buy"
        ? "📊 *LIVE BUY ADS — Sellers available*"
        : type === "sell"
            ? "📊 *LIVE SELL ADS — Best rates*"
            : "📊 *P2PFATHER LIVE ORDERBOOK*";

    const lines = orders.slice(0, 5).map((o, i) => {
        const trader = formatTraderContact(o.users);
        const limits = formatOrderLimits(o);
        const link = waLink(`trade_ad_${o.id}`);
        return `${i + 1}. *₹${o.rate}* | ${limits} | ${(o.payment_methods ?? []).join("/")} — ${trader}\n   👉 ${link}`;
    });

    return `${header}\n\n${lines.join("\n\n")}\n\n_Tap a link → private chat → instant escrow trade 🔒_`;
}
