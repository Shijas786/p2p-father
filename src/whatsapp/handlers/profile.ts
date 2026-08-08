/**
 * WhatsApp Profile & Payment Methods Handler
 * Handles: /profile, payment method management (UPI, Bank Account, Digital e-Rupee)
 * Cross-platform synced with Telegram & Web MiniApp
 */

import type { WASocket, IWebMessageInfo } from "../types";
import type { User } from "../../types";
import { db } from "../../db/client";
import { reply, replyWithButtons, replyWithList } from "../router";

/** Helper: Check if user has at least one valid payment method configured */
export function hasPaymentMethods(user: User): boolean {
    return Boolean(
        user.upi_id ||
        user.bank_account_number ||
        user.digital_rupee_id ||
        user.phone_number
    );
}

export async function handleProfileCommand(
    sock: WASocket,
    msg: IWebMessageInfo,
    jid: string,
    user: User,
    text: string
): Promise<void> {
    const lowerText = text.toLowerCase().trim();

    // ─── /profile — Display Profile & Payment Methods ─────────────────────────
    if (lowerText === "/profile" || lowerText === "profile") {
        await showProfileCard(sock, jid, user, msg);
        return;
    }

    // ─── Button Callbacks: Initiate Payment Details Editing ───────────────────
    if (lowerText === "set_upi") {
        await (db as any).setWhatsappState(user.id, "AWAITING_UPI_INPUT", {});
        await replyWithButtons(
            sock,
            jid,
            `📱 *SET YOUR UPI ID*\n\nPlease reply to this message with your *UPI ID*.\n\n*Example:* \`shijas@upi\` or \`9876543210@mbkns\``,
            [
                { id: "/profile", label: "🔙 Back to Profile" },
            ]
        );
        return;
    }

    if (lowerText === "set_bank") {
        await (db as any).setWhatsappState(user.id, "AWAITING_BANK_INPUT", {});
        await replyWithButtons(
            sock,
            jid,
            `🏦 *SET YOUR BANK DETAILS*\n\nPlease reply with your Bank Details in this exact format:\n\`AccountNo, IFSC, BankName\`\n\n*Example:*\n\`1234567890, SBIN0001234, State Bank of India\``,
            [
                { id: "/profile", label: "🔙 Back to Profile" },
            ]
        );
        return;
    }

    if (lowerText === "set_erupee") {
        await (db as any).setWhatsappState(user.id, "AWAITING_ERUPEE_INPUT", {});
        await replyWithButtons(
            sock,
            jid,
            `📲 *SET YOUR DIGITAL E-RUPEE VPA*\n\nPlease reply to this message with your *Digital e-Rupee VPA ID*.\n\n*Example:* \`9876543210@eRupee\``,
            [
                { id: "/profile", label: "🔙 Back to Profile" },
            ]
        );
        return;
    }

    // ─── Input Collectors for Pending States ──────────────────────────────────
    const state = await (db as any).getWhatsappState(user.id);
    if (!state) return;

    // Check if user tapped Back or Cancel
    if (lowerText === "back" || lowerText === "cancel" || lowerText === "/profile" || lowerText === "profile") {
        await (db as any).clearWhatsappState(user.id);
        await showProfileCard(sock, jid, user, msg);
        return;
    }

    // 1. UPI Collector
    if (state.key === "AWAITING_UPI_INPUT") {
        const upiId = text.trim();
        if (!upiId || upiId.length < 3 || !upiId.includes("@")) {
            await reply(sock, jid, "❌ Invalid UPI ID. Please enter a valid UPI ID (e.g. `name@upi`).", msg);
            return;
        }

        await db.updateUser(user.id, { upi_id: upiId } as any);
        await (db as any).clearWhatsappState(user.id);

        await replyWithButtons(
            sock,
            jid,
            `✅ *UPI ID SAVED!*\n\nYour UPI ID is set to: \`${upiId}\`\n\nIt will now be automatically displayed to buyers/sellers during trades.`,
            [
                { id: "/post",    label: "➕ Post New Ad" },
                { id: "/profile", label: "👤 View Profile" },
            ]
        );
        return;
    }

    // 2. Bank Details Collector
    if (state.key === "AWAITING_BANK_INPUT") {
        const parts = text.split(",").map((p) => p.trim());
        if (parts.length < 2) {
            await reply(
                sock,
                jid,
                "❌ Invalid format. Please provide: `AccountNo, IFSC, BankName`\n\n*Example:*\n`1234567890, SBIN0001234, State Bank of India`",
                msg
            );
            return;
        }

        const accountNumber = parts[0];
        const ifsc = parts[1].toUpperCase();
        const bankName = parts[2] || "Bank Transfer";

        await db.updateUser(user.id, {
            bank_account_number: accountNumber,
            bank_ifsc: ifsc,
            bank_name: bankName,
        } as any);
        await (db as any).clearWhatsappState(user.id);

        await replyWithButtons(
            sock,
            jid,
            `✅ *BANK DETAILS SAVED!*\n\n• *Bank:* ${bankName}\n• *Account:* \`${accountNumber}\`\n• *IFSC:* \`${ifsc}\``,
            [
                { id: "/post",    label: "➕ Post New Ad" },
                { id: "/profile", label: "👤 View Profile" },
            ]
        );
        return;
    }

    // 3. Digital e-Rupee Collector
    if (state.key === "AWAITING_ERUPEE_INPUT") {
        const eRupeeId = text.trim();
        if (!eRupeeId || eRupeeId.length < 3) {
            await reply(sock, jid, "❌ Invalid e-Rupee VPA. Please enter a valid e-Rupee ID.", msg);
            return;
        }

        await db.updateUser(user.id, { digital_rupee_id: eRupeeId } as any);
        await (db as any).clearWhatsappState(user.id);

        await replyWithButtons(
            sock,
            jid,
            `✅ *DIGITAL E-RUPEE ID SAVED!*\n\nYour e-Rupee VPA is set to: \`${eRupeeId}\``,
            [
                { id: "/post",    label: "➕ Post New Ad" },
                { id: "/profile", label: "👤 View Profile" },
            ]
        );
        return;
    }
}

/** Render user profile with payment methods, trade history, and Telegram link status */
async function showProfileCard(
    sock: WASocket,
    jid: string,
    user: User,
    msg: IWebMessageInfo
): Promise<void> {
    const upiDisplay = user.upi_id ? `\`${user.upi_id}\`` : "❌ Not set";
    const bankDisplay = user.bank_account_number
        ? `\`${user.bank_account_number}\` (${user.bank_name || "Bank"})`
        : "❌ Not set";
    const ifscDisplay = user.bank_ifsc ? `\`${user.bank_ifsc}\`` : "❌ Not set";
    const eRupeeDisplay = user.digital_rupee_id ? `\`${user.digital_rupee_id}\`` : "❌ Not set";

    const tgLinkStatus = user.telegram_id
        ? `✅ Linked (@${user.username || user.first_name || "Telegram User"} | ID: \`${user.telegram_id}\`)`
        : "❌ Not linked (Tap /link to connect)";

    const profileText = `👤 *YOUR P2PFATHER PROFILE*

• *Trader:* ${user.username ? `@${user.username}` : (user.first_name || "Trader")}
• *Telegram Sync:* ${tgLinkStatus}
• *P2P Wallet:* \`${user.wallet_address || "N/A"}\`

📊 *ORDER & TRADE HISTORY*
• *Completed Trades:* ${user.completed_trades ?? 0}
• *Trust Score:* ⭐ ${user.trust_score ?? 100}%
• *Total Volume:* $${((user as any).total_volume ?? 0).toFixed(2)} USDT

💳 *PAYMENT DETAILS*
📱 *UPI ID:* ${upiDisplay}
🏦 *Bank Account:* ${bankDisplay}
🏛️ *Bank IFSC:* ${ifscDisplay}
📲 *Digital e-Rupee:* ${eRupeeDisplay}

_Select an option below to manage payment details, view trades, or link Telegram:_`;

    const sections = [
        {
            title: "💳 PAYMENT DETAILS",
            rows: [
                { id: "set_upi",    title: "📱 Set / Edit UPI ID",           description: user.upi_id ? `Current: ${user.upi_id}` : "Add your UPI VPA" },
                { id: "set_bank",   title: "🏦 Set / Edit Bank Details",     description: user.bank_account_number ? `Account: ${user.bank_account_number}` : "Add Account & IFSC" },
                { id: "set_erupee", title: "📲 Set / Edit Digital e-Rupee", description: user.digital_rupee_id ? `VPA: ${user.digital_rupee_id}` : "Add e-Rupee VPA" },
            ],
        },
        {
            title: "📜 HISTORY & ACCOUNT SYNC",
            rows: [
                { id: "/trades",  title: "📜 My Trade History",     description: "View active and completed trades" },
                { id: "/link",    title: "✈️ Link Telegram Account", description: user.telegram_id ? "Already linked to Telegram" : "Sync Telegram & MiniApp" },
                { id: "/deposit", title: "📥 Deposit Address & QR",  description: "Get deposit QR code & EVM address" },
            ],
        },
    ];

    await replyWithList(
        sock,
        jid,
        profileText,
        "⚙️ Manage Profile & Payments",
        sections
    );
}
