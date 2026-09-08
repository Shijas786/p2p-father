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

    // ─── /faucet ──────────────────────────────────────────────────────────────
    if (text === "/faucet" || text === "faucet" || text.includes("testnet faucet")) {
        await reply(
            sock,
            jid,
            `ℹ️ *P2PFather is connected to Mainnet (BSC & Base)*\n\nTo fund your non-custodial wallet, please use */deposit* to view your personal deposit address for USDT / USDC / BNB.`,
            msg
        );
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

        // Helper to resolve asset balances
        const resolveBalances = (bals: any, t: string, c: string) => {
            const isBsc = c === "bsc";
            const isUsdc = t.toUpperCase() === "USDC";
            const wKey = isBsc ? (isUsdc ? "bsc_usdc" : "bsc_usdt") : (isUsdc ? "usdc" : "usdt");
            const vKey = isBsc ? (isUsdc ? "vault_bsc_usdc" : "vault_bsc_usdt") : (isUsdc ? "vault_usdc" : "vault_usdt");
            return {
                wallet: (parseFloat(bals?.[wKey] || "0")).toFixed(2),
                vault: (parseFloat(bals?.[vKey] || "0")).toFixed(2),
            };
        };

        // Text command shortcut: e.g. /vault_deposit 100 or /vault_deposit 100 usdc base
        if (parts.length >= 2 && !isNaN(parseFloat(parts[1]))) {
            const amount = parseFloat(parts[1]);
            let token = "USDT";
            let chainKey = "bsc";

            if (parts.length >= 4) {
                token = parts[2].toUpperCase();
                chainKey = parts[3].toLowerCase().includes("base") ? "base" : "bsc";
            } else if (parts.length === 3) {
                const p2 = parts[2].toLowerCase();
                if (p2 === "usdc" || p2 === "usdt") {
                    token = p2.toUpperCase();
                    chainKey = token === "USDC" ? "base" : "bsc";
                } else {
                    chainKey = p2.includes("base") ? "base" : "bsc";
                }
            }

            const chainLabel = chainKey === "base" ? "Base" : "BSC";
            let walletBal = "0.00", vaultBal = "0.00";
            try {
                if (user.wallet_address) {
                    const bals = await wallet.getBalances(user.wallet_address);
                    const res = resolveBalances(bals, token, chainKey);
                    walletBal = res.wallet;
                    vaultBal = res.vault;
                }
            } catch (_) {}

            await replyWithButtons(
                sock,
                jid,
                `🔒 *CONFIRM VAULT TOP-UP*

• *Token:* ${token}
• *Network:* ${chainLabel} Mainnet
• *Wallet Balance:* ${walletBal} ${token}
• *Vault Balance:* ${vaultBal} ${token} (🔒 ${chainLabel} Escrow)
• *Top-Up Amount:* ${amount} ${token} (${chainLabel})
• *Target:* P2PFather Smart Contract Escrow Vault (${chainLabel})

Proceed to lock funds into Smart-Contract Escrow for P2P trading?`,
                [
                    { id: `confirm_vault_dep_${amount}_${token}_${chainKey}`, label: `🔒 Lock ${amount} ${token} (${chainLabel})` },
                    { id: "/deposit",                                       label: "📥 Deposit First" },
                    { id: "/balance",                                       label: "❌ Cancel" },
                ]
            );
            return;
        }

        // Interactive wizard: Step 1 — Overview of both networks & assets
        let bscUsdt = "0.00", bscVaultUsdt = "0.00";
        let bscUsdc = "0.00", bscVaultUsdc = "0.00";
        let baseUsdt = "0.00", baseVaultUsdt = "0.00";
        let baseUsdc = "0.00", baseVaultUsdc = "0.00";
        try {
            if (user.wallet_address) {
                const bals = await wallet.getBalances(user.wallet_address);
                bscUsdt = (parseFloat(bals.bsc_usdt || "0")).toFixed(2);
                bscVaultUsdt = (parseFloat(bals.vault_bsc_usdt || "0")).toFixed(2);
                bscUsdc = (parseFloat(bals.bsc_usdc || "0")).toFixed(2);
                bscVaultUsdc = (parseFloat(bals.vault_bsc_usdc || "0")).toFixed(2);

                baseUsdt = (parseFloat(bals.usdt || "0")).toFixed(2);
                baseVaultUsdt = (parseFloat(bals.vault_usdt || "0")).toFixed(2);
                baseUsdc = (parseFloat(bals.usdc || "0")).toFixed(2);
                baseVaultUsdc = (parseFloat(bals.vault_usdc || "0")).toFixed(2);
            }
        } catch (_) {}

        await replyWithButtons(
            sock,
            jid,
            `🔒 *VAULT TOP-UP — SELECT NETWORK*

P2PFather supports Smart-Contract Escrow for *USDT & USDC* on BSC & Base:

🟡 *BSC (BNB Smart Chain)*
• USDT: ${bscUsdt} (Locked: ${bscVaultUsdt})
• USDC: ${bscUsdc} (Locked: ${bscVaultUsdc})

🔵 *Base Network*
• USDC: ${baseUsdc} (Locked: ${baseVaultUsdc})
• USDT: ${baseUsdt} (Locked: ${baseVaultUsdt})

Select which network you want to deposit into: 👇`,
            [
                { id: "vdep_net_bsc",  label: "🟡 BSC (USDT / USDC)" },
                { id: "vdep_net_base", label: "🔵 Base (USDC / USDT)" },
                { id: "/balance",     label: "❌ Cancel" },
            ]
        );
        return;
    }

    // ─── Step 2: Choose Token on Network (vdep_net_bsc / vdep_net_base) ───────
    if (text === "vdep_net_bsc" || text === "vdep_net_base") {
        const chainKey = text === "vdep_net_base" ? "base" : "bsc";
        const chainLabel = chainKey === "base" ? "Base" : "BSC";

        let usdtBal = "0.00", usdtVault = "0.00";
        let usdcBal = "0.00", usdcVault = "0.00";
        try {
            if (user.wallet_address) {
                const bals = await wallet.getBalances(user.wallet_address);
                if (chainKey === "bsc") {
                    usdtBal = (parseFloat(bals.bsc_usdt || "0")).toFixed(2);
                    usdtVault = (parseFloat(bals.vault_bsc_usdt || "0")).toFixed(2);
                    usdcBal = (parseFloat(bals.bsc_usdc || "0")).toFixed(2);
                    usdcVault = (parseFloat(bals.vault_bsc_usdc || "0")).toFixed(2);
                } else {
                    usdtBal = (parseFloat(bals.usdt || "0")).toFixed(2);
                    usdtVault = (parseFloat(bals.vault_usdt || "0")).toFixed(2);
                    usdcBal = (parseFloat(bals.usdc || "0")).toFixed(2);
                    usdcVault = (parseFloat(bals.vault_usdc || "0")).toFixed(2);
                }
            }
        } catch (_) {}

        await replyWithButtons(
            sock,
            jid,
            `🔒 *${chainLabel.toUpperCase()} VAULT — SELECT TOKEN*

• *USDT Balance:* ${usdtBal} (Locked: ${usdtVault})
• *USDC Balance:* ${usdcBal} (Locked: ${usdcVault})

Select the token you want to lock into your ${chainLabel} Escrow Vault: 👇`,
            [
                { id: `vdep_select_${chainKey}_usdt`, label: `💵 ${chainLabel} USDT` },
                { id: `vdep_select_${chainKey}_usdc`, label: `💵 ${chainLabel} USDC` },
                { id: "/balance",                     label: "❌ Cancel" },
            ]
        );
        return;
    }

    // ─── Step 3: Prompt for amount (vdep_select_<chain>_<token>) ──────────────
    if (text.startsWith("vdep_select_")) {
        const parts = text.replace("vdep_select_", "").toLowerCase().split("_");
        const chainKey = parts[0]?.includes("base") ? "base" : "bsc";
        const token = (parts[1] || "usdt").toUpperCase();
        const chainLabel = chainKey === "base" ? "Base" : "BSC";

        let walletBal = "0.00", vaultBal = "0.00";
        try {
            if (user.wallet_address) {
                const bals = await wallet.getBalances(user.wallet_address);
                const isBsc = chainKey === "bsc";
                const isUsdc = token === "USDC";
                const wKey = isBsc ? (isUsdc ? "bsc_usdc" : "bsc_usdt") : (isUsdc ? "usdc" : "usdt");
                const vKey = isBsc ? (isUsdc ? "vault_bsc_usdc" : "vault_bsc_usdt") : (isUsdc ? "vault_usdc" : "vault_usdt");
                walletBal = (parseFloat(bals?.[wKey] || "0")).toFixed(2);
                vaultBal = (parseFloat(bals?.[vKey] || "0")).toFixed(2);
            }
        } catch (_) {}

        await (db as any).setWhatsappState(user.id, "AWAITING_VAULT_DEP_AMOUNT", { chain: chainKey, token });

        await replyWithButtons(
            sock,
            jid,
            `🔒 *TOP UP ${chainLabel.toUpperCase()} VAULT (${token})*

• *Token:* ${token}
• *Network:* ${chainLabel} Mainnet
• *Wallet Balance:* ${walletBal} ${token}
• *Vault Locked:* ${vaultBal} ${token} (🔒 ${chainLabel} Escrow)

Please reply to this message with the *${token} amount* to move into your ${chainLabel} Escrow Vault:
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

        const chainKey = (walletState.data?.chain || "bsc").toLowerCase();
        const token = (walletState.data?.token || "USDT").toUpperCase();
        const chainLabel = chainKey === "base" ? "Base" : "BSC";

        let walletBal = "0.00", vaultBal = "0.00";
        let walletBalNum = 0;
        try {
            if (user.wallet_address) {
                const bals = await wallet.getBalances(user.wallet_address);
                const isBsc = chainKey === "bsc";
                const isUsdc = token === "USDC";
                const wKey = isBsc ? (isUsdc ? "bsc_usdc" : "bsc_usdt") : (isUsdc ? "usdc" : "usdt");
                const vKey = isBsc ? (isUsdc ? "vault_bsc_usdc" : "vault_bsc_usdt") : (isUsdc ? "vault_usdc" : "vault_usdt");
                walletBalNum = parseFloat(bals?.[wKey] || "0");
                walletBal = walletBalNum.toFixed(2);
                vaultBal = (parseFloat(bals?.[vKey] || "0")).toFixed(2);
            }
        } catch (_) {}

        // 🛡️ Bug 6 Fix: Block if amount > available wallet balance
        if (amount > walletBalNum + 0.000001) {
            await reply(
                sock,
                jid,
                `❌ *INSUFFICIENT BALANCE*\n\nYou want to lock *${amountStr} ${token}* but your ${chainLabel} wallet only has *${walletBal} ${token}*.\n\nPlease /deposit first then try again.`,
                msg
            );
            return;
        }

        // 🛡️ Bug 8 Fix: Clear state AFTER confirmation is sent
        await replyWithButtons(
            sock,
            jid,
            `🔒 *CONFIRM VAULT TOP-UP*

• *Token:* ${token}
• *Network:* ${chainLabel} Mainnet
• *Wallet Balance:* ${walletBal} ${token}
• *Vault Balance:* ${vaultBal} ${token} (🔒 ${chainLabel} Escrow)
• *Top-Up Amount:* ${amountStr} ${token} (${chainLabel})
• *Target:* P2PFather Smart Contract Escrow Vault (${chainLabel})

Tap below to confirm locking funds on-chain:`,
            [
                { id: `confirm_vault_dep_${amountStr}_${token}_${chainKey}`, label: `🔒 Lock ${amountStr} ${token} (${chainLabel})` },
                { id: "/deposit",                                          label: "📥 Deposit First" },
                { id: "/balance",                                          label: "❌ Cancel" },
            ]
        );
        await (db as any).clearWhatsappState(user.id);
        return;
    }

    // ─── vdep_chain_<amount>_<chain> (legacy fallback) ───────────────────────
    if (text.startsWith("vdep_chain_")) {
        const parts = text.replace("vdep_chain_", "").split("_");
        const amountStr = parts[0] || "10";
        const chainKey = (parts[1] || "bsc").toLowerCase();
        const token = (parts[2] || "USDT").toUpperCase();
        const chainLabel = chainKey === "base" ? "Base" : "BSC";

        let walletBal = "0.00", vaultBal = "0.00";
        try {
            if (user.wallet_address) {
                const bals = await wallet.getBalances(user.wallet_address);
                const isBsc = chainKey === "bsc";
                const isUsdc = token === "USDC";
                const wKey = isBsc ? (isUsdc ? "bsc_usdc" : "bsc_usdt") : (isUsdc ? "usdc" : "usdt");
                const vKey = isBsc ? (isUsdc ? "vault_bsc_usdc" : "vault_bsc_usdt") : (isUsdc ? "vault_usdc" : "vault_usdt");
                walletBal = (parseFloat(bals?.[wKey] || "0")).toFixed(2);
                vaultBal = (parseFloat(bals?.[vKey] || "0")).toFixed(2);
            }
        } catch (_) {}

        await replyWithButtons(
            sock,
            jid,
            `🔒 *CONFIRM VAULT TOP-UP*

• *Token:* ${token}
• *Network:* ${chainLabel} Mainnet
• *Wallet Balance:* ${walletBal} ${token}
• *Vault Balance:* ${vaultBal} ${token} (🔒 ${chainLabel} Escrow)
• *Top-Up Amount:* ${amountStr} ${token} (${chainLabel})
• *Target:* P2PFather Smart Contract Escrow Vault (${chainLabel})

Proceed to lock funds into Smart-Contract Escrow for P2P trading?`,
            [
                { id: `confirm_vault_dep_${amountStr}_${token}_${chainKey}`, label: `🔒 Lock ${amountStr} ${token} (${chainLabel})` },
                { id: "/deposit",                                          label: "📥 Deposit First" },
                { id: "/balance",                                          label: "❌ Cancel" },
            ]
        );
        return;
    }

    // ─── confirm_vault_dep_<amount>_<token>_<chain> ──────────────────────────
    if (text.startsWith("confirm_vault_dep_")) {
        const parts = text.replace("confirm_vault_dep_", "").split("_");
        const amountStr = parts[0] || "50";
        let token = "USDT";
        let chainKey = "bsc";

        if (parts.length >= 3) {
            token = parts[1].toUpperCase();
            chainKey = parts[2].toLowerCase();
        } else if (parts.length === 2) {
            chainKey = parts[1].toLowerCase();
        }

        const chainLabel = chainKey === "base" ? "Base" : "BSC";

        // 🛡️ Bug 1 Fix: Guard against null wallet_index before on-chain operation
        if (user.wallet_index === null || user.wallet_index === undefined) {
            await reply(sock, jid, "❌ Your wallet is not fully initialized. Please contact support.", msg);
            return;
        }

        try {
            await reply(sock, jid, `⏳ Locking ${amountStr} ${token} into ${chainLabel} Smart Contract Vault... Please wait.`, msg);

            const { wallet } = await import("../../services/wallet");
            const { env } = await import("../../config/env");

            let tokenAddress = "0x55d398326f99059fF775485246999027B3197955";
            if (chainKey === "bsc") {
                tokenAddress = token === "USDC"
                    ? "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
                    : "0x55d398326f99059fF775485246999027B3197955";
            } else if (chainKey === "base") {
                tokenAddress = token === "USDC" ? env.USDC_ADDRESS : env.USDT_ADDRESS;
            }

            const txHash = await wallet.depositToVault(user.wallet_index, amountStr, tokenAddress, chainKey as any);

            // Fetch fresh balances post-deposit
            let newWalletBal = "0.00", newVaultBal = "0.00";
            try {
                const freshBals = await wallet.getBalances(user.wallet_address!);
                const isBsc = chainKey === "bsc";
                const isUsdc = token === "USDC";
                const wKey = isBsc ? (isUsdc ? "bsc_usdc" : "bsc_usdt") : (isUsdc ? "usdc" : "usdt");
                const vKey = isBsc ? (isUsdc ? "vault_bsc_usdc" : "vault_bsc_usdt") : (isUsdc ? "vault_usdc" : "vault_usdt");
                newWalletBal = (parseFloat(freshBals?.[wKey] || "0")).toFixed(2);
                newVaultBal = (parseFloat(freshBals?.[vKey] || "0")).toFixed(2);
            } catch (_) {}

            const explorerBase = chainKey === "bsc" ? "https://bscscan.com/tx/" : "https://basescan.org/tx/";
            const explorerLink = `${explorerBase}${txHash}`;
            const explorerName = chainKey === "bsc" ? "BscScan" : "BaseScan";

            await replyWithButtons(
                sock,
                jid,
                `🎉 *VAULT TOP-UP SUCCESSFUL!*

• *Amount Locked:* ${amountStr} ${token}
• *Wallet Balance Remaining:* ${newWalletBal} ${token}
• *Vault Balance Locked:* ${newVaultBal} ${token} (🔒 Escrow Vault)
• *Chain:* ${chainLabel}
• *Tx Hash:* \`${txHash}\`

🔗 *${explorerName} Explorer Link:*
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
\`/withdraw <address> <amount> <token> <chain>\`

*Example:*
\`/withdraw 0x742d35Cc6634... 50 USDT bsc\`
\`/withdraw 0x742d35Cc6634... 25 USDC base\`

Supported tokens: *USDT*, *USDC*
Supported chains: *BSC* (\`bsc\`), *Base* (\`base\`)`,
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
        const chain     = ((parts[4] || "bsc") as any).toLowerCase();

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
            const balKey = chain === "bsc" ? (token === "USDC" ? "bsc_usdc" : "bsc_usdt") : (token === "USDC" ? "usdc" : "usdt");
            currentBalance = parseFloat((bals as any)[balKey] || "0");
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
                { id: `confirm_wd_${toAddress}_${amount}_${token}_${chain}`, label: "✅ Confirm Withdrawal" },
                { id: "/balance",                                            label: "❌ Cancel" },
            ]
        );
        return;
    }

    // ─── confirm_wd_<address>_<amount>_<token>_<chain> ────────────────────────
    if (text.startsWith("confirm_wd_")) {
        const raw = text.replace("confirm_wd_", "");
        const parts = raw.split("_");

        const toAddress = parts[0];
        const amountStr = parts[1] || "10";
        const withdrawAmount = parseFloat(amountStr);
        let token = "USDT";
        let chainKey = "bsc";

        if (parts.length >= 4) {
            token = (parts[2] || "USDT").toUpperCase();
            chainKey = (parts[3] || "bsc").toLowerCase();
        } else if (parts.length === 3) {
            chainKey = (parts[2] || "bsc").toLowerCase();
        }

        // 🛡️ Bug 2 Fix: Guard against null wallet_index before on-chain operation
        if (user.wallet_index === null || user.wallet_index === undefined) {
            await reply(sock, jid, "❌ Your wallet is not fully initialized. Please contact support.", msg);
            return;
        }

        try {
            // Re-verify reserved funds lock
            const reserved = await (db as any).getReservedAmount(user.id, token, chainKey);
            const { wallet } = await import("../../services/wallet");
            const bals = await wallet.getBalances(user.wallet_address ?? "");
            const balKey = chainKey === "bsc" ? (token === "USDC" ? "bsc_usdc" : "bsc_usdt") : (token === "USDC" ? "usdc" : "usdt");
            const currentBal = parseFloat((bals as any)[balKey] || "0");
            const available = Math.max(0, currentBal - reserved);

            if (withdrawAmount > available && reserved > 0) {
                await reply(sock, jid, `❌ Withdrawal blocked: ${reserved} ${token} is locked in active sell ads. Cancel your ads to release funds.`, msg);
                return;
            }

            await reply(sock, jid, "⏳ Executing withdrawal... Please wait.", msg);

            const { env } = await import("../../config/env");

            let tokenAddress = "0x55d398326f99059fF775485246999027B3197955";
            if (chainKey === "bsc") {
                tokenAddress = token === "USDC"
                    ? "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
                    : "0x55d398326f99059fF775485246999027B3197955";
            } else if (chainKey === "base") {
                tokenAddress = token === "USDC" ? env.USDC_ADDRESS : env.USDT_ADDRESS;
            } else if (chainKey === "polygon") {
                tokenAddress = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
            }

            const txHash = await wallet.sendToken(
                user.wallet_index,
                toAddress,
                amountStr,
                tokenAddress,
                chainKey as any
            );

            const explorerBase = chainKey === "bsc"
                ? "https://bscscan.com/tx/"
                : (chainKey === "polygon" ? "https://polygonscan.com/tx/" : "https://basescan.org/tx/");

            await replyWithButtons(
                sock,
                jid,
                `🎉 *WITHDRAWAL SUCCESSFUL!*

• *To:* \`${toAddress}\`
• *Amount:* ${amountStr} ${token}
• *Chain:* ${chainKey.toUpperCase()}
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
            cancelUnderfundedAds(user.id, user.wallet_address!, token, chainKey, escrow).catch(console.error);
        } catch (err: any) {
            await reply(sock, jid, `❌ Withdrawal failed: ${err?.message || err}`, msg);
        }
        return;
    }
}
