/**
 * WhatsApp Profile & Payment Methods Handler
 * Handles: /profile, payment method management (UPI, Bank Account, Digital e-Rupee)
 * Cross-platform synced with Telegram & Web MiniApp
 */

import type { WASocket, IWebMessageInfo } from "../types";
import type { User } from "../../types";
import { db } from "../../db/client";
import { reply, replyWithButtons, replyWithList } from "../router";

/** Helper: Check if user has at least one valid payment method configured.
 * NOTE: phone_number alone is NOT a valid payment method for P2P trading.
 * Users need UPI, bank account, or digital rupee to actually receive/send fiat payments.
 */
export function hasPaymentMethods(user: User): boolean {
    return Boolean(
        user.upi_id ||
        user.bank_account_number ||
        user.digital_rupee_id
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

    // ─── /profile or Page 1 — Display Profile & Payment Methods ────────────────
    if (lowerText === "/profile" || lowerText === "profile" || lowerText === "profile_page_1") {
        await showProfilePage1(sock, jid, user, msg);
        return;
    }

    // ─── Page 2 — Display Trade History & Account Sync ────────────────────────
    if (lowerText === "profile_page_2") {
        await showProfilePage2(sock, jid, user, msg);
        return;
    }

    // ─── Edit Payments Menu Callback ──────────────────────────────────────────
    if (lowerText === "edit_payments_menu") {
        await replyWithButtons(
            sock,
            jid,
            `💳 *EDIT PAYMENT DETAILS*\n\nWhich payment method do you want to set or update?`,
            [
                { id: "set_upi",    label: "📱 Set UPI ID" },
                { id: "set_bank",   label: "🏦 Set Bank Details" },
                { id: "/profile",   label: "🔙 Back to Profile" },
            ]
        );
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
        await showProfilePage1(sock, jid, user, msg);
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
            `✅ *UPI ID SAVED!*\n\nYour UPI ID is set to: \`${upiId}\``,
            [
                { id: "/post",    label: "➕ Post New Ad" },
                { id: "/profile", label: "🔙 Back to Profile" },
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
                { id: "/profile", label: "🔙 Back to Profile" },
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
                { id: "/profile", label: "🔙 Back to Profile" },
            ]
        );
        return;
    }
}

/** Render Profile Page 1: Profile & Payment Details + Single-line Navigation */
async function showProfilePage1(
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

    const isTgLinked = Boolean(user.telegram_id && Number(user.telegram_id) > 0);
    const tgLinkStatus = isTgLinked
        ? `✅ Linked (@${user.username || user.first_name || "Telegram User"})`
        : "❌ Not linked (Tap /link to connect)";

    const isKyc = Boolean(user.is_verified || user.kyc_status === 'verified' || user.kyc_status === 'approved');
    const kycBadge = isKyc ? "✅ Verified" : "⏳ Unverified";

    const profileText = `👤 *YOUR P2PFATHER PROFILE* (Page 1/2)

• *Trader:* ${user.username ? `@${user.username}` : (user.first_name || "Trader")}
• *KYC Status:* ${kycBadge}
• *Telegram Sync:* ${tgLinkStatus}
• *P2P Wallet:* \`${user.wallet_address || "N/A"}\`
• *Networks:* Base & BSC

💳 *CURRENT PAYMENT DETAILS*
📱 *UPI ID:* ${upiDisplay}
🏦 *Bank Account:* ${bankDisplay}
🏛️ *Bank IFSC:* ${ifscDisplay}
📲 *Digital e-Rupee:* ${eRupeeDisplay}`;

    await replyWithButtons(sock, jid, profileText, [
        { id: "edit_payments_menu", label: "📱 Edit Payments" },
        { id: "vault_deposit",      label: "🔒 Lock to Vault" },
        { id: "profile_page_2",     label: "▶️ Next Page" },
    ]);

    await new Promise((r) => setTimeout(r, 250));

    // Message 2: Universal Navigation Bar
    await replyWithButtons(sock, jid, `🧭 *NAVIGATION MENU*`, [
        { id: "/start",   label: "🏠 Main Menu" },
        { id: "/balance", label: "💰 View Balance" },
        { id: "/post",    label: "➕ Post New Ad" },
    ]);
}

/** Render Profile Page 2: Trade History & Account Sync + Single-line Navigation */
async function showProfilePage2(
    sock: WASocket,
    jid: string,
    user: User,
    msg: IWebMessageInfo
): Promise<void> {
    const isTgLinked = Boolean(user.telegram_id && Number(user.telegram_id) > 0);
    const tgLinkStatus = isTgLinked
        ? `✅ Linked (@${user.username || user.first_name || "Telegram User"})`
        : "❌ Not linked (Tap /link to connect)";

    const isKyc = Boolean(user.is_verified || user.kyc_status === 'verified' || user.kyc_status === 'approved');
    const kycBadge = isKyc ? "✅ Verified" : "⏳ Unverified";

    const actionsText = `⚡ *TRADE HISTORY & SYNC* (Page 2/2)

📊 *ORDER & TRADE HISTORY*
• *KYC Status:* ${kycBadge}
• *Completed Trades:* ${user.completed_trades ?? 0}
• *Trust Score:* ⭐ ${user.trust_score ?? 100}%
• *Total Volume:* $${((user as any).total_volume ?? 0).toFixed(2)} USDT

✈️ *TELEGRAM & MINIAPP SYNC*
• *Telegram Sync:* ${tgLinkStatus}`;

    await replyWithButtons(sock, jid, actionsText, [
        { id: "/trades",        label: "📜 Trade History" },
        { id: "profile_page_1", label: "🔙 Prev Page" },
        { id: "/start",         label: "🏠 Main Menu" },
    ]);
}
