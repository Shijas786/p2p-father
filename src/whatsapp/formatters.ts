/**
 * P2PFather WhatsApp Message Formatter
 * All WhatsApp message templates live here for easy editing.
 *
 * WhatsApp bold:   *text*
 * WhatsApp italic: _text_
 * WhatsApp mono:   ```text```
 */

import type { Order, Trade, User } from "../types";

const BOT_NUMBER = process.env.WA_BOT_NUMBER || "";

/** Deep link into private DM to start a specific action */
export function waLink(text: string): string {
    return `https://wa.me/${BOT_NUMBER}?text=${encodeURIComponent(text)}`;
}

// ─── Main Menu ────────────────────────────────────────────────────────────────
export const MAIN_MENU = `🤖 *P2PFather — Crypto P2P Exchange*

*What would you like to do?*

💰 /balance — Check wallet balance
📥 /deposit — Get your deposit address & QR
📤 /send — Withdraw / send crypto
📊 /ads — Browse live P2P ads
➕ /post — Post a new Buy or Sell Ad
📋 /trades — View your active trades
👤 /profile — Your trader profile
❓ /help — Help & support

_Tap any command or type it below ↓_`;

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
        const traderName = o.users?.username ? `@${o.users.username}` : (o.users?.first_name ?? "Trader");
        const trust = o.users?.trust_score ?? 0;
        const payMethods = (o.payment_methods ?? []).join(", ");
        const link = waLink(`trade_ad_${o.id}`);

        return `${i + 1}️⃣ *Rate: ₹${o.rate}* | Limit: ₹${o.min_amount ?? 0}–₹${o.max_amount ?? 0}
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
        return `${i + 1}. *${o.type.toUpperCase()} ${o.token}* @ ₹${o.rate} | ${status}
   Limits: ₹${o.min_amount ?? 0}–₹${o.max_amount ?? 0}
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

export function fmtTradeReleased(trade: Trade): string {
    return `🎉 *TRADE COMPLETED!*

✅ ${trade.buyer_receives} USDT sent to buyer's wallet.
• *TX Hash:* \`${(trade.release_tx_hash ?? "").slice(0, 20)}...\`

Thank you for trading on P2PFather! 🙏

Rate your experience: /review_${trade.id}`;
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

// ─── Group Live Ad Broadcast ──────────────────────────────────────────────────
export function fmtGroupAdBroadcast(order: any): string {
    const type = order.type === "sell" ? "🟢 *SELLING USDT*" : "🔴 *BUYING USDT*";
    const trader = order.users?.username ? `@${order.users.username}` : "Verified Trader";
    const trust = order.users?.trust_score ?? 0;
    const payMethods = (order.payment_methods ?? []).join(", ");
    const link = waLink(`trade_ad_${order.id}`);

    return `🔥 *LIVE P2P AD — P2PFATHER*

${type}
• *Rate:* ₹${order.rate} / USDT
• *Limits:* ₹${order.min_amount ?? 0} – ₹${order.max_amount ?? 0}
• *Payment:* ${payMethods}
• *Trader:* ${trader} (${trust}% ⭐)

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
        const trader = o.users?.username ? `@${o.users.username}` : "Trader";
        const link = waLink(`trade_ad_${o.id}`);
        return `${i + 1}. *₹${o.rate}* | ₹${o.min_amount}–${o.max_amount} | ${(o.payment_methods ?? []).join("/")} — ${trader}\n   👉 ${link}`;
    });

    return `${header}\n\n${lines.join("\n\n")}\n\n_Tap a link → private chat → instant escrow trade 🔒_`;
}
