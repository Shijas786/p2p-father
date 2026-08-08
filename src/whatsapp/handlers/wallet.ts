/**
 * WhatsApp Wallet Handler
 * Handles: /balance, /deposit, /send, /withdraw
 */

import type { WASocket, IWebMessageInfo } from "../types";
import type { User } from "../../types";
import { wallet } from "../../services/wallet";
import { db } from "../../db/client";
import { reply, replyWithButtons } from "../router";
import { fmtWalletBalance, fmtDepositAddress } from "../formatters";
import { hypermeowClient } from "../hypermeowClient";
import QRCode from "qrcode";

export async function handleWalletCommand(
    sock: WASocket,
    msg: IWebMessageInfo,
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
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${user.wallet_address}`;

            // Send QR image first via Hypermeow
            await hypermeowClient.sendImage(
                jid,
                qrImageUrl,
                `📥 *Your P2PFather Deposit QR*\n\nScan to send USDT / USDC to:\n\`${user.wallet_address}\``
            );

            // Then send instructions with interactive buttons
            await replyWithButtons(sock, jid, fmtDepositAddress(user), [
                { id: "/balance", label: "💰 Check Balance" },
                { id: "/ads",     label: "📊 Trade Now" },
                { id: "/post",    label: "➕ Post New Ad" },
            ]);
        } catch (err) {
            await reply(sock, jid, fmtDepositAddress(user), msg);
        }
        return;
    }

    // ─── /vault_deposit or [📥 Move to Vault] ─────────────────────────────────
    if (text.startsWith("/vault_deposit") || text === "vault_deposit") {
        const parts = text.split(/\s+/);
        const amount = parseFloat(parts[1] || "50");
        const chain = (parts[2] || "bsc").toLowerCase();

        if (isNaN(amount) || amount <= 0) {
            await reply(sock, jid, "❌ Reply format: `/vault_deposit <amount> <chain>` (e.g. `/vault_deposit 100 bsc`)", msg);
            return;
        }

        await replyWithButtons(
            sock,
            jid,
            `🔒 *CONFIRM VAULT TOP-UP*

• *Amount:* ${amount} USDT (${chain.toUpperCase()})
• *Target:* P2PFather Smart Contract Escrow Vault

Proceed to lock funds into Smart-Contract Escrow for P2P trading?`,
            [
                { id: `confirm_vault_dep_${amount}_${chain}`, label: "✅ Lock to Vault" },
                { id: "/balance",                           label: "❌ Cancel" },
            ]
        );
        return;
    }

    // ─── confirm_vault_dep_<amount>_<chain> ──────────────────────────────────
    if (text.startsWith("confirm_vault_dep_")) {
        const parts = text.replace("confirm_vault_dep_", "").split("_");
        const amountStr = parts[0] || "50";
        const chainKey = (parts[1] || "bsc").toLowerCase();

        try {
            await reply(sock, jid, "⏳ Locking funds into Smart Contract Vault... Please wait.", msg);

            const { wallet } = await import("../../services/wallet");
            const { env } = await import("../../config/env");

            let tokenAddress = env.USDT_ADDRESS;
            if (chainKey === "bsc") tokenAddress = "0x55d398326f99059fF775485246999027B3197955";
            if (chainKey === "polygon") tokenAddress = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";

            const txHash = await wallet.depositToVault(user.wallet_index, amountStr, tokenAddress, chainKey as any);

            const explorerBase = chainKey === "bsc" ? "https://bscscan.com/tx/" : "https://basescan.org/tx/";

            await replyWithButtons(
                sock,
                jid,
                `🎉 *VAULT TOP-UP SUCCESSFUL!*

• *Amount Locked:* ${amountStr} USDT
• *Chain:* ${chainKey.toUpperCase()}
• *Tx Hash:* \`${txHash}\`
🔗 *Explorer:* ${explorerBase}${txHash}

Your vault is ready for P2P trading! 🚀`,
                [
                    { id: "/post",    label: "➕ Post SELL Ad" },
                    { id: "/balance", label: "💰 View Vault Balance" },
                ]
            );
        } catch (err: any) {
            await reply(sock, jid, `❌ Vault Top-Up failed: ${err?.message || err}`, msg);
        }
        return;
    }

    // ─── /send or /withdraw ───────────────────────────────────────────────────
    if (text.startsWith("/send") || text.startsWith("/withdraw")) {
        const parts = text.split(/\s+/);

        if (parts.length < 4) {
            await replyWithButtons(
                sock,
                jid,
                `📤 *WITHDRAW / SEND CRYPTO*

To withdraw, reply in this format:
\`/withdraw <address> <amount> USDT <chain>\`

*Example:*
\`/withdraw 0x742d35Cc6634... 50 USDT bsc\`

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

        const gasCoin = chain === "bsc" ? "BNB" : chain === "polygon" ? "POL" : "ETH";

        // Direct 1-tap confirmation step
        await replyWithButtons(
            sock,
            jid,
            `📤 *CONFIRM WITHDRAWAL*

• *To:* \`${toAddress}\`
• *Amount:* ${amount} ${token} (${chain.toUpperCase()})
• *Gas Fee:* Required in wallet (${gasCoin})

Proceed to execute on-chain transfer?`,
            [
                { id: `confirm_wd_${toAddress}_${amount}_${chain}`, label: "✅ Confirm Withdrawal" },
                { id: "/balance",                                    label: "❌ Cancel" },
            ]
        );
        return;
    }

    // ─── confirm_wd_<address>_<amount>_<chain> ────────────────────────────────
    if (text.startsWith("confirm_wd_")) {
        const raw = text.replace("confirm_wd_", "");
        const parts = raw.split("_");

        const toAddress = parts[0];
        const amountStr = parts[1] || "10";
        const chainKey  = (parts[2] || "bsc").toLowerCase();

        try {
            await reply(sock, jid, "⏳ Executing withdrawal... Please wait.", msg);

            const { wallet } = await import("../../services/wallet");
            const { env } = await import("../../config/env");

            let tokenAddress = env.USDT_ADDRESS;
            if (chainKey === "bsc") tokenAddress = "0x55d398326f99059fF775485246999027B3197955";
            if (chainKey === "polygon") tokenAddress = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";

            const txHash = await wallet.sendToken(
                user.wallet_index,
                toAddress,
                amountStr,
                tokenAddress,
                chainKey as any
            );

            const explorerBase = chainKey === "bsc" ? "https://bscscan.com/tx/" : "https://basescan.org/tx/";

            await replyWithButtons(
                sock,
                jid,
                `🎉 *WITHDRAWAL SUCCESSFUL!*

• *To:* \`${toAddress}\`
• *Amount:* ${amountStr} USDT
• *Chain:* ${chainKey.toUpperCase()}
• *Tx Hash:* \`${txHash}\`
🔗 *Explorer:* ${explorerBase}${txHash}`,
                [
                    { id: "/balance", label: "💰 View Balance" },
                    { id: "/profile", label: "👤 View Profile" },
                ]
            );
        } catch (err: any) {
            await reply(sock, jid, `❌ Withdrawal failed: ${err?.message || "Insufficient balance"}`, msg);
        }
        return;
    }
}
