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
export const MAIN_MENU = `🎩 *P2PFATHER — INSTANT P2P CRYPTO EXCHANGE*

Welcome to Kerala's pioneer non-custodial P2P escrow network. 

Select an action below to get started:`;

// ─── Wallet ───────────────────────────────────────────────────────────────────
export function fmtWalletBalance(
    user: User,
    balances: { token: string; amount: string }[]
): string {
    const address = user.wallet_address ?? "Not set";

    const labelMap: Record<string, string> = {
        testnet_usdt: "USDT (🧪 BSC Testnet)",
        testnet_bnb: "BNB (🧪 BSC Testnet Gas)",
        vault_testnet_usdt: "USDT (🔒 Locked in Escrow Vault)",
        bsc_usdt: "USDT (BSC Mainnet)",
        usdt: "USDT (Base Mainnet)",
        bsc_usdc: "USDC (BSC Mainnet)",
        usdc: "USDC (Base Mainnet)",
        bnb: "BNB (BSC Mainnet)",
        eth: "ETH (Base Mainnet)",
        pol: "POL (Polygon Mainnet)",
        vault_usdt: "USDT (Base Vault)",
        vault_usdc: "USDC (Base Vault)",
        vault_bsc_usdt: "USDT (BSC Vault)",
        vault_bsc_usdc: "USDC (BSC Vault)",
    };

    const balanceLines = balances.length > 0
        ? balances.map((b) => `  • *${labelMap[b.token] || b.token.toUpperCase()}:* ${b.amount}`).join("\n")
        : "  _No balance found. Free testnet USDT & BNB gas auto-credited on registration._";

    return `💰 *YOUR P2PFATHER WALLET*

💳 *Address:*
\`${address}\`

📊 *Balances:*
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

    const isKyc = Boolean(user.is_verified || user.kyc_status === 'approved');
    const badge = isKyc ? " [🛡️ KYC Verified]" : "";

    // 1. Prefer Username
    if (user.username) {
        return `@${user.username}${badge}`;
    }

    // 2. Prefer First Name (ignore synthetic WA_XXXX IDs)
    if (user.first_name && !/^WA_\d+$/.test(user.first_name)) {
        return `${user.first_name}${badge}`;
    }

    // 3. Fallback: Masked Phone Number (e.g. @9181*******0)
    const phone = String(user.whatsapp_phone || user.phone_number || "").replace("+", "").trim();
    if (phone && phone.length >= 7) {
        const prefix = phone.slice(0, 4);
        const suffix = phone.slice(-1);
        const stars = "*".repeat(Math.max(3, phone.length - 5));
        return `@${prefix}${stars}${suffix}${badge}`;
    }

    return `Verified Trader${badge}`;
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

export function fmtMyAds(orders: Order[]): string {
    if (orders.length === 0) {
        return `📋 *You have no active ads.*\n\nPost one now with /post 🚀`;
    }

    const lines = orders.map((o, i) => {
        const shortId = o.id.slice(0, 8);
        const totalFiat = Math.round((o.amount || 0) * (o.rate || 0));

        const chainLabel = o.chain === "bsc_testnet" ? "🧪 BSC Testnet" : (o.chain === "base_sepolia" ? "🧪 Base Sepolia" : (o.chain || "BSC").toUpperCase());

        return `${i + 1}. *${o.type.toUpperCase()} ${o.token}* @ ₹${o.rate} / USDT | 🟢 ACTIVE
   • Amount: ${o.amount} ${o.token} (Total: ₹${totalFiat.toLocaleString("en-IN")})
   • Chain: ${chainLabel} | Payment: ${(o.payment_methods ?? []).join(", ") || "UPI"}
   👉 Delete: \`/delete_${shortId}\``;
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

export function formatSellerPaymentDetails(seller: any, order?: any): string {
    const details: string[] = [];

    // 1. Order-level payment details
    const orderPay = order?.payment_details;
    if (orderPay) {
        if (typeof orderPay === "object") {
            if (orderPay.upi) details.push(`• *UPI ID:* \`${orderPay.upi}\``);
            if (orderPay.google_pay || orderPay.gpay) details.push(`• *GPay / PhonePe:* \`${orderPay.google_pay || orderPay.gpay}\``);
            if (orderPay.paytm) details.push(`• *Paytm:* \`${orderPay.paytm}\``);
            if (orderPay.bank) {
                const b = orderPay.bank;
                if (typeof b === "object") {
                    if (b.account_number) details.push(`• *Bank Acc:* \`${b.account_number}\``);
                    if (b.ifsc) details.push(`• *IFSC:* \`${b.ifsc}\``);
                    if (b.name) details.push(`• *Acc Name:* ${b.name}`);
                } else if (typeof b === "string") {
                    details.push(`• *Bank Info:* ${b}`);
                }
            }
        } else if (typeof orderPay === "string") {
            details.push(`• *Payment Info:* ${orderPay}`);
        }
    }

    // 2. User profile payment details (fallback)
    if (details.length === 0 && seller) {
        if (seller.upi_id) {
            details.push(`• *UPI ID:* \`${seller.upi_id}\``);
        }
        if (seller.bank_account_number) {
            details.push(`• *Bank Acc:* \`${seller.bank_account_number}\``);
            if (seller.ifsc_code) details.push(`• *IFSC:* \`${seller.ifsc_code}\``);
            if (seller.account_holder_name) details.push(`• *Acc Name:* ${seller.account_holder_name}`);
        }
        if (seller.whatsapp_phone || seller.phone_number) {
            const phone = String(seller.whatsapp_phone || seller.phone_number).replace("+", "").trim();
            details.push(`• *Seller Contact:* \`+${phone}\``);
        }
    }

    if (details.length === 0) {
        return `⚠️ _Seller hasn't configured payment details yet. Ask in group or contact seller._`;
    }

    return details.join("\n");
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

export function fmtKycApprovedBroadcast(user: any): string {
    const handle = formatTraderContact(user);

    return `🎉 *KYC VERIFICATION APPROVED!* 🛡️

*${handle}* is now a **VERIFIED MERCHANT** 🎩

• *Badge Awarded:* [🛡️ KYC Verified]
• *Family Status:* 🟢 MADE MAN (P2PFather Family)

✅ Identity Verified
⚡ Trade safe with *${handle}* in all group chats! 🚀

👉 *Want your [🛡️ KYC Verified] badge?* Tap /profile to start verification!`;
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

    const chainRaw = (order.chain || "bsc").toLowerCase();
    const isTestnet = chainRaw.includes("testnet") || chainRaw.includes("sepolia") || chainRaw.includes("devnet");
    const chainLabel = isTestnet
        ? `🧪 DEMO / TESTNET (${chainRaw.toUpperCase()}) — ⚠️ NO REAL MONEY`
        : chainRaw.toUpperCase();

    const payMethods = (order.payment_methods ?? []).join(", ") || "UPI";
    const link = waLink(`trade_ad_${order.id}`);

    const orderLine = `${emoji} *${trader}*${verifiedBadge} ${actionVerb} *${amount} ${token}*`;
    const rateLine = `💰 Rate: ₹${rate.toLocaleString()}/${token}`;
    const totalLine = `🧾 Total: ₹${totalFiat.toLocaleString("en-IN")}`;
    const chainLine = `🔗 Chain: ${chainLabel}`;
    const paymentLine = `💳 Payment: ${payMethods}`;

    const lines = [
        isTestnet ? `🧪 *[DEMO / TESTNET AD]*\n${header}` : header,
        "",
        orderLine,
        rateLine,
        totalLine,
        chainLine,
        paymentLine,
    ];

    if (order.payment_details?.require_kyc) {
        lines.push("🛡️ Requirement: *KYC Verified Only*");
    }

    if (order.payment_details?.allowed_dealers && order.payment_details.allowed_dealers.length > 0) {
        lines.push("👥 Target: *Specific Whitelisted Dealers Only*");
    }

    if (isTestnet) {
        lines.push("⚠️ *DEMO AD ONLY — FOR TESTING (NO REAL MONEY INVOLVED)*");
    }

    lines.push("", "👉 *Start Trade in Private DM:*", link);

    return lines.join("\n");
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
