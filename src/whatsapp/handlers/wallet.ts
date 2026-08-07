/**
 * WhatsApp Wallet Handler
 * Handles: /balance, /deposit, /send, /withdraw
 */

import type { WASocket, proto } from "@whiskeysockets/baileys";
import type { User } from "../../types";
import { wallet } from "../../services/wallet";
import { db } from "../../db/client";
import { reply, replyWithButtons } from "../router";
import { fmtWalletBalance, fmtDepositAddress } from "../formatters";
import QRCode from "qrcode";

export async function handleWalletCommand(
    sock: WASocket,
    msg: proto.IWebMessageInfo,
    jid: string,
    senderPhone: string,
    user: User,
    text: string
): Promise<void> {
    // ─── /balance ─────────────────────────────────────────────────────────────
    if (text.startsWith("/balance")) {
        await reply(sock, jid, "⏳ Fetching your balances...", msg);

        try {
            // Fetch balances using the correct wallet method
            const balances: { token: string; amount: string }[] = [];
            try {
                const bals = await wallet.getBalances(user.wallet_address ?? "");
                for (const [token, amount] of Object.entries(bals)) {
                    if (parseFloat(amount as string) > 0) {
                        balances.push({ token, amount: `${amount}` });
                    }
                }
            } catch (_) {
                // Silent fail — show empty balance message
            }

            const message = fmtWalletBalance(user, balances);
            await replyWithButtons(sock, jid, message, [
                { id: "/deposit", label: "📥 Deposit" },
                { id: "/send",    label: "📤 Send/Withdraw" },
                { id: "/ads",     label: "📊 Browse Ads" },
            ]);
        } catch (err) {
            await reply(sock, jid, "❌ Failed to fetch balances. Please try again later.", msg);
        }
        return;
    }

    // ─── /deposit ─────────────────────────────────────────────────────────────
    if (text.startsWith("/deposit")) {
        if (!user.wallet_address) {
            await reply(sock, jid, "❌ No wallet address found. Contact support.", msg);
            return;
        }

        try {
            // Generate QR code as buffer
            const qrBuffer = await QRCode.toBuffer(user.wallet_address, {
                errorCorrectionLevel: "M",
                type: "png",
                width: 400,
            });

            // Send QR image first
            await sock.sendMessage(jid, {
                image: qrBuffer,
                caption: `📥 *Your P2PFather Deposit QR*\n\nScan to send USDT to: \`${user.wallet_address}\``,
            });

            // Then send instructions with buttons
            await replyWithButtons(sock, jid, fmtDepositAddress(user), [
                { id: "/balance", label: "💰 Check Balance" },
                { id: "/ads",     label: "📊 Trade Now" },
            ]);
        } catch (err) {
            await reply(sock, jid, `📥 *Your Deposit Address:*\n\n\`\`\`${user.wallet_address}\`\`\`\n\nSend USDT on BSC, Polygon, or Base only.`, msg);
        }
        return;
    }

    // ─── /send or /withdraw ───────────────────────────────────────────────────
    if (text.startsWith("/send") || text.startsWith("/withdraw")) {
        // Parse: /send 0x1234...abcd 50 USDT bsc
        const parts = text.split(/\s+/);

        if (parts.length < 4) {
            await replyWithButtons(
                sock,
                jid,
                `📤 *SEND / WITHDRAW CRYPTO*

To send, reply in this format:
\`/send <address> <amount> <token> <chain>\`

*Example:*
\`/send 0x742d35Cc6634... 50 USDT bsc\`

Supported tokens: USDT
Supported chains: BSC, Polygon, Base`,
                [{ id: "/balance", label: "💰 Check Balance" }]
            );
            return;
        }

        const toAddress = parts[1];
        const amount    = parseFloat(parts[2]);
        const token     = (parts[3] || "USDT").toUpperCase();
        const chain     = ((parts[4] || "bsc") as any).toLowerCase();

        if (isNaN(amount) || amount <= 0) {
            await reply(sock, jid, "❌ Invalid amount. Please enter a positive number.", msg);
            return;
        }

        // Confirm step (PIN-like — ask for 4-digit PIN)
        await reply(
            sock,
            jid,
            `📤 *CONFIRM WITHDRAWAL*

• *To:* \`${toAddress.slice(0, 10)}...${toAddress.slice(-4)}\`
• *Amount:* ${amount} ${token} (${chain.toUpperCase()})
• *Fee:* Covered by P2PFather Relayer

⚠️ Please enter your *4-digit security PIN* to confirm:
_(Set your PIN at /profile if not set)_`,
            msg
        );

        await (db as any).setWhatsappState(user.id, "AWAITING_WITHDRAW_PIN", {
            to_address: toAddress,
            amount,
            token,
            chain,
        });
        return;
    }

    // ─── Handle state: AWAITING_WITHDRAW_PIN ──────────────────────────────────
    const state = await (db as any).getWhatsappState(user.id);
    if (state?.key === "AWAITING_WITHDRAW_PIN") {
        const pin = text.trim();

        // Require PIN to be set
        if (!user.security_pin) {
            await (db as any).clearWhatsappState(user.id);
            await reply(sock, jid, "❌ No security PIN set on your account. Set one in the MiniApp Profile before sending crypto.", msg);
            return;
        }

        if (user.security_pin !== pin) {
            await reply(sock, jid, "❌ Incorrect 4-digit security PIN. Please try again:", msg);
            return;
        }

        const data = state.data;
        try {
            await reply(sock, jid, "⏳ Executing withdrawal... Please wait.", msg);

            // Resolve token address by chain
            const { wallet } = await import("../../services/wallet");
            const { env } = await import("../../config/env");

            const chainKey = (data.chain ?? "bsc").toLowerCase();
            let tokenAddress: string;
            if (chainKey === "bsc") {
                tokenAddress = "0x55d398326f99059fF775485246999027B3197955"; // BSC USDT
            } else if (chainKey === "polygon") {
                tokenAddress = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"; // Polygon USDT
            } else {
                tokenAddress = env.USDT_ADDRESS; // Base USDT
            }

            const txHash = await wallet.sendToken(
                user.wallet_index,
                data.to_address,
                data.amount,
                tokenAddress,
                chainKey as any
            );

            await (db as any).clearWhatsappState(user.id);

            await reply(
                sock,
                jid,
                `✅ *WITHDRAWAL SUCCESSFUL!* 🎉\n\n• *To:* \`${data.to_address}\`\n• *Amount:* ${data.amount} ${data.token}\n• *Chain:* ${chainKey.toUpperCase()}\n• *Tx Hash:* \`${txHash}\``,
                msg
            );
        } catch (err: any) {
            await (db as any).clearWhatsappState(user.id);
            await reply(sock, jid, `❌ Withdrawal failed: ${err.message || "Insufficient balance or gas"}`, msg);
        }
        return;
    }
}
