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
                { id: "/deposit",      label: "📥 Deposit USDT" },
                { id: "/withdraw",     label: "📤 Send/Withdraw" },
                { id: "vault_deposit", label: "🔒 Lock to Vault" },
            ]);

            await new Promise((r) => setTimeout(r, 250));

            // Message 2: Universal Navigation Bar
            await replyWithButtons(sock, jid, `🧭 *NAVIGATION MENU*`, [
                { id: "/start",   label: "🏠 Main Menu" },
                { id: "/profile", label: "👤 My Profile" },
                { id: "/post",    label: "➕ Post New Ad" },
            ]);
        } catch (err) {
            await reply(sock, jid, "❌ Failed to fetch balances. Please try again later.", msg);
        }
        return;
    }

    // ─── /faucet — Testnet USDT & BNB Faucet for Beta Testing ────────────────
    if (text === "/faucet" || text === "faucet" || text.includes("testnet faucet")) {
        if (!user.wallet_address) {
            await reply(sock, jid, "❌ No wallet address found. Please create a wallet first.", msg);
            return;
        }

        await reply(sock, jid, "⏳ Minting 1,000.00 Testnet USDT + transferring 0.05 BNB Gas Fee to your wallet...", msg);

        try {
            const res = await wallet.dispenseAutoTestnetFaucet(user.wallet_address);

            const supabase = db.getClient();
            const cache = (user as any).predictions_cache || {};
            const currentTestnetUsdt = (parseFloat(cache.testnet_usdt || "0") + 1000).toFixed(2);
            const currentTestnetBnb = (parseFloat(cache.testnet_bnb || "0") + 0.05).toFixed(4);

            const updatedCache = {
                ...cache,
                testnet_usdt: currentTestnetUsdt,
                testnet_bnb: currentTestnetBnb
            };

            await supabase
                .from("users")
                .update({ predictions_cache: updatedCache } as any)
                .eq("id", user.id);

            await replyWithButtons(
                sock,
                jid,
                `🎉 *TESTNET FAUCET DISPENSED!* 🧪

💰 *Testnet USDT Balance:* ${res.usdt || currentTestnetUsdt} USDT
⚡ *Testnet BNB Gas Balance:* ${res.bnb || currentTestnetBnb} BNB

You can now post P2P Ads on *🧪 BSC Testnet* and test live trades with zero financial risk!

Choose an option below to start testing 👇`,
                [
                    { id: "/post",  label: "➕ Post Testnet Ad" },
                    { id: "https://p2pfather.com/webapp", url: "https://p2pfather.com/webapp", label: "🌐 Web Dashboard" },
                    { id: "/start", label: "🏠 Main Menu" },
                ]
            );
        } catch (err: any) {
            await reply(sock, jid, "❌ Failed to dispense testnet faucet. Please try again.", msg);
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

            // Then send instructions with primary action buttons
            await replyWithButtons(sock, jid, fmtDepositAddress(user), [
                { id: "/balance",      label: "💰 View Balance" },
                { id: "vault_deposit", label: "🔒 Lock to Vault" },
                { id: "/post",         label: "➕ Post New Ad" },
            ]);

            await new Promise((r) => setTimeout(r, 250));

            // Message 2: Universal Navigation Bar
            await replyWithButtons(sock, jid, `🧭 *NAVIGATION MENU*`, [
                { id: "/start",   label: "🏠 Main Menu" },
                { id: "/profile", label: "👤 My Profile" },
                { id: "https://p2pfather.com/webapp", url: "https://p2pfather.com/webapp", label: "🌐 Web Dashboard" },
            ]);
        } catch (err) {
            await reply(sock, jid, fmtDepositAddress(user), msg);
        }
        return;
    }

    // ─── /vault_deposit or [🔒 Lock to Vault] ─────────────────────────────────
    if (text.startsWith("/vault_deposit") || text === "vault_deposit") {
        const parts = text.split(/\s+/);

        let testnetUsdt = "0.00", vaultUsdt = "0.00";
        try {
            if (user.wallet_address) {
                const bals = await wallet.getBalances(user.wallet_address);
                testnetUsdt = (parseFloat(bals.testnet_usdt || "0")).toFixed(2);
                vaultUsdt = (parseFloat(bals.vault_testnet_usdt || "0")).toFixed(2);
            }
        } catch (_) {}

        // If amount was provided in text command (e.g. /vault_deposit 100)
        if (parts.length >= 2 && !isNaN(parseFloat(parts[1]))) {
            const amount = parseFloat(parts[1]);
            const chain = (parts[2] || "bsc_testnet").toLowerCase();

            await replyWithButtons(
                sock,
                jid,
                `🔒 *CONFIRM VAULT TOP-UP*

• *Wallet Balance:* ${testnetUsdt} USDT (🧪 BSC Testnet)
• *Vault Balance:* ${vaultUsdt} USDT (🔒 Escrow Vault)
• *Top-Up Amount:* ${amount} USDT (BSC Testnet)
• *Target:* P2PFather Smart Contract Escrow Vault

Proceed to lock funds into Smart-Contract Escrow for P2P trading?`,
                [
                    { id: `confirm_vault_dep_${amount}_${chain}`, label: `🔒 Lock ${amount} USDT to Vault` },
                    { id: "/deposit",                           label: "📥 Deposit First" },
                    { id: "/balance",                           label: "❌ Cancel" },
                ]
            );
            return;
        }

        // Interactive wizard: Step 1 — Ask user for amount input
        await (db as any).setWhatsappState(user.id, "AWAITING_VAULT_DEP_AMOUNT", {});
        await replyWithButtons(
            sock,
            jid,
            `🔒 *VAULT TOP-UP*

• *Wallet Balance:* ${testnetUsdt} USDT (🧪 BSC Testnet)
• *Vault Balance:* ${vaultUsdt} USDT (🔒 Escrow Vault)

Please reply to this message with the *USDT amount* you want to move into your Smart Contract Escrow Vault:
_(Example: 10 or 50 or 100)_`,
            [
                { id: "/deposit", label: "📥 Deposit First" },
                { id: "/balance", label: "❌ Cancel" },
            ]
        );
        return;
    }

    // ─── State: AWAITING_VAULT_DEP_AMOUNT ─────────────────────────────────────
    const walletState = await (db as any).getWhatsappState(user.id);
    if (walletState?.key === "AWAITING_VAULT_DEP_AMOUNT") {
        const amountStr = text.trim();
        const amount = parseFloat(amountStr);

        if (isNaN(amount) || amount <= 0) {
            await reply(sock, jid, "❌ Invalid amount. Please enter a valid number (e.g. 10 or 50):", msg);
            return;
        }

        await (db as any).clearWhatsappState(user.id);

        let testnetUsdt = "0.00", vaultUsdt = "0.00";
        try {
            if (user.wallet_address) {
                const bals = await wallet.getBalances(user.wallet_address);
                testnetUsdt = (parseFloat(bals.testnet_usdt || "0")).toFixed(2);
                vaultUsdt = (parseFloat(bals.vault_testnet_usdt || "0")).toFixed(2);
            }
        } catch (_) {}

        const chainKey = "bsc_testnet";

        await replyWithButtons(
            sock,
            jid,
            `🔒 *CONFIRM VAULT TOP-UP*

• *Wallet Balance:* ${testnetUsdt} USDT (🧪 BSC Testnet)
• *Vault Balance:* ${vaultUsdt} USDT (🔒 Escrow Vault)
• *Top-Up Amount:* ${amountStr} USDT (BSC Testnet)
• *Target:* P2PFather Smart Contract Escrow Vault

Tap below to confirm locking funds on-chain:`,
            [
                { id: `confirm_vault_dep_${amountStr}_${chainKey}`, label: `🔒 Lock ${amountStr} USDT to Vault` },
                { id: "/deposit",                                  label: "📥 Deposit First" },
                { id: "/balance",                                  label: "❌ Cancel" },
            ]
        );
        return;
    }

    // ─── vdep_chain_<amount>_<chain> ─────────────────────────────────────────
    if (text.startsWith("vdep_chain_")) {
        const parts = text.replace("vdep_chain_", "").split("_");
        const amountStr = parts[0] || "10";
        const chainKey = (parts[1] || "bsc_testnet").toLowerCase();

        let testnetUsdt = "0.00", vaultUsdt = "0.00";
        try {
            if (user.wallet_address) {
                const bals = await wallet.getBalances(user.wallet_address);
                testnetUsdt = (parseFloat(bals.testnet_usdt || "0")).toFixed(2);
                vaultUsdt = (parseFloat(bals.vault_testnet_usdt || "0")).toFixed(2);
            }
        } catch (_) {}

        await replyWithButtons(
            sock,
            jid,
            `🔒 *CONFIRM VAULT TOP-UP*

• *Wallet Balance:* ${testnetUsdt} USDT (🧪 BSC Testnet)
• *Vault Balance:* ${vaultUsdt} USDT (🔒 Escrow Vault)
• *Top-Up Amount:* ${amountStr} USDT (${chainKey.toUpperCase()})
• *Target:* P2PFather Smart Contract Escrow Vault

Proceed to lock funds into Smart-Contract Escrow for P2P trading?`,
            [
                { id: `confirm_vault_dep_${amountStr}_${chainKey}`, label: `🔒 Lock ${amountStr} USDT to Vault` },
                { id: "/deposit",                                  label: "📥 Deposit First" },
                { id: "/balance",                                  label: "❌ Cancel" },
            ]
        );
        return;
    }

    // ─── confirm_vault_dep_<amount>_<chain> ──────────────────────────────────
    if (text.startsWith("confirm_vault_dep_")) {
        const parts = text.replace("confirm_vault_dep_", "").split("_");
        const amountStr = parts[0] || "50";
        let chainKey = (parts[1] || "bsc_testnet").toLowerCase();
        if (chainKey === "bsc") chainKey = "bsc_testnet";

        try {
            await reply(sock, jid, "⏳ Locking funds into Smart Contract Vault... Please wait.", msg);

            const { wallet } = await import("../../services/wallet");
            const { env } = await import("../../config/env");

            let tokenAddress = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";
            if (chainKey === "bsc_testnet") {
                const bal1 = await wallet.getTokenBalance(user.wallet_address!, "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd", "bsc_testnet" as any, 18).catch(() => "0");
                if (parseFloat(bal1) >= parseFloat(amountStr)) {
                    tokenAddress = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";
                } else {
                    tokenAddress = "0x21d4945A5499107F19F819dA1ab9133902A58EAB";
                }
            } else if (chainKey === "polygon") {
                tokenAddress = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
            }

            const txHash = await wallet.depositToVault(user.wallet_index, amountStr, tokenAddress, chainKey as any);

            // Fetch fresh balances post-deposit
            let newWalletBal = "0.00", newVaultBal = "0.00";
            try {
                const freshBals = await wallet.getBalances(user.wallet_address!);
                newWalletBal = (parseFloat(freshBals.testnet_usdt || "0")).toFixed(2);
                newVaultBal = (parseFloat(freshBals.vault_testnet_usdt || "0")).toFixed(2);
            } catch (_) {}

            const explorerLink = `https://testnet.bscscan.com/tx/${txHash}`;

            await replyWithButtons(
                sock,
                jid,
                `🎉 *VAULT TOP-UP SUCCESSFUL!*

• *Amount Locked:* ${amountStr} USDT
• *Wallet Balance Remaining:* ${newWalletBal} USDT
• *Vault Balance Locked:* ${newVaultBal} USDT (🔒 Escrow Vault)
• *Chain:* BSC TESTNET
• *Tx Hash:* \`${txHash}\`

🔗 *BscScan Explorer Link:*
${explorerLink}

Your Escrow Vault is ready for P2P trading! 🚀`,
                [
                    { id: "/post",    label: "➕ Post SELL Ad" },
                    { id: "/balance", label: "💰 View Balance" },
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
\`/withdraw 0x742d35Cc6634... 50 USDT bsc_testnet\`

Supported chain for demo testing: BSC Testnet (\`bsc_testnet\`)`,
                [
                    { id: "/balance",      label: "💰 View Balance" },
                    { id: "/deposit",      label: "📥 Deposit USDT" },
                    { id: "vault_deposit", label: "🔒 Lock to Vault" },
                ]
            );

            await new Promise((r) => setTimeout(r, 250));

            // Message 2: Universal Navigation Bar
            await replyWithButtons(sock, jid, `🧭 *NAVIGATION MENU*`, [
                { id: "/start",   label: "🏠 Main Menu" },
                { id: "/profile", label: "👤 My Profile" },
                { id: "https://p2pfather.com/webapp", url: "https://p2pfather.com/webapp", label: "🌐 Web Dashboard" },
            ]);
            return;
        }

        const toAddress = parts[1];
        const amount    = parseFloat(parts[2]);
        const token     = (parts[3] || "USDT").toUpperCase();
        const chain     = ((parts[4] || "bsc_testnet") as any).toLowerCase();

        if (isNaN(amount) || amount <= 0) {
            await reply(sock, jid, "❌ Invalid amount. Please enter a positive number.", msg);
            return;
        }

        // ════ VALIDATION: Prevent Withdrawal of Funds Reserved for Active Sell Ads ════
        const { wallet } = await import("../../services/wallet");
        const reserved = await (db as any).getReservedAmount(user.id, token, chain);
        let currentBalance = 0;
        try {
            const bals = await wallet.getBalances(user.wallet_address ?? "");
            currentBalance = parseFloat((bals as any)[token] || "0");
        } catch (_) {}

        const available = Math.max(0, currentBalance - reserved);
        if (amount > available && reserved > 0) {
            await replyWithButtons(
                sock,
                jid,
                `❌ *INSUFFICIENT AVAILABLE BALANCE* 🔒

• *Wallet Balance:* ${currentBalance.toFixed(2)} ${token}
• *🔒 Locked in Active Ads:* ${reserved.toFixed(2)} ${token}
• *✅ Max Withdrawable:* ${available.toFixed(2)} ${token}

Your funds are frozen for active sell ads to guarantee buyer escrow. 
To withdraw, please cancel or complete your active sell ads first.`,
                [
                    { id: "/my_ads",  label: "📋 My Active Ads" },
                    { id: "/balance", label: "💰 Wallet Balance" }
                ]
            );
            return;
        }

        const gasCoin = (chain === "bsc" || chain === "bsc_testnet") ? "tBNB" : chain === "polygon" ? "POL" : "ETH";

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
        const withdrawAmount = parseFloat(amountStr);
        let chainKey  = (parts[2] || "bsc_testnet").toLowerCase();
        if (chainKey === "bsc") chainKey = "bsc_testnet";

        try {
            // Re-verify reserved funds lock
            const reserved = await (db as any).getReservedAmount(user.id, "USDT", chainKey);
            const { wallet } = await import("../../services/wallet");
            const bals = await wallet.getBalances(user.wallet_address ?? "");
            const currentBal = parseFloat((bals as any)["USDT"] || "0");
            const available = Math.max(0, currentBal - reserved);

            if (withdrawAmount > available && reserved > 0) {
                await reply(sock, jid, `❌ Withdrawal blocked: ${reserved} USDT is locked in active sell ads. Cancel your ads to release funds.`, msg);
                return;
            }

            await reply(sock, jid, "⏳ Executing withdrawal... Please wait.", msg);

            const { env } = await import("../../config/env");

            let tokenAddress = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";
            if (chainKey === "bsc_testnet") tokenAddress = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";
            else if (chainKey === "bsc") tokenAddress = "0x55d398326f99059fF775485246999027B3197955";
            else if (chainKey === "polygon") tokenAddress = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";

            const txHash = await wallet.sendToken(
                user.wallet_index,
                toAddress,
                amountStr,
                tokenAddress,
                chainKey as any
            );

            const explorerBase = chainKey === "bsc_testnet"
                ? "https://testnet.bscscan.com/tx/"
                : (chainKey === "bsc" ? "https://bscscan.com/tx/" : "https://basescan.org/tx/");

            await replyWithButtons(
                sock,
                jid,
                `🎉 *WITHDRAWAL SUCCESSFUL!*

• *To:* \`${toAddress}\`
• *Amount:* ${amountStr} USDT
• *Chain:* BSC TESTNET
• *Tx Hash:* \`${txHash}\`

🔗 *Explorer Link:* ${explorerBase}${txHash}

Withdrawal confirmed on-chain! 🚀`,
                [
                    { id: "/balance", label: "💰 View Balance" },
                    { id: "/start",   label: "🏠 Main Menu" },
                ]
            );
            // Instantly cancel any sell ads that are now under-funded.
            const { escrow } = await import("../../services/escrow");
            const { cancelUnderfundedAds } = await import("../../services/jobs");
            cancelUnderfundedAds(user.id, user.wallet_address!, "USDT", chainKey, escrow).catch(console.error);
        } catch (err: any) {
            await reply(sock, jid, `❌ Withdrawal failed: ${err?.message || err}`, msg);
        }
        return;
    }
}
