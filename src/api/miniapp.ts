// ═══════════════════════════════════════════════════════════════
//  MINI APP API — Express Router for Telegram Mini App
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { env } from "../config/env";
import { db } from "../db/client";
import { wallet } from "../services/wallet";
import { escrow } from "../services/escrow";
import { bot, broadcastTradeSuccess } from "../bot";

const router = Router();

// Helper for trade notifications
async function notifyTradeUpdate(userId: string, message: string) {
    try {
        const user = await db.getUserById(userId);
        if (user && user.telegram_id) {
            await bot.api.sendMessage(user.telegram_id, message, { parse_mode: "HTML" });
        }
    } catch (err) {
        console.error("[NOTIFY] Failed to send notification:", err);
    }
}

// ═══════════════════════════════════════════════════════════════
//  TELEGRAM INIT DATA VALIDATION MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

interface TelegramUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
}

declare global {
    namespace Express {
        interface Request {
            telegramUser?: TelegramUser;
        }
    }
}

function validateInitData(req: Request, res: Response, next: NextFunction) {
    const initData = req.headers["x-telegram-init-data"] as string;

    // Dev mode bypass
    if (!initData && env.NODE_ENV === "development") {
        req.telegramUser = {
            id: 123456789, // Match real user Cryptowolf07 for testing
            first_name: "Cryptowolf07",
            username: "Cryptowolf07",
        };
        return next();
    }

    if (!initData) {
        return res.status(401).json({ error: "Missing Telegram init data" });
    }

    try {
        const params = new URLSearchParams(initData);
        const hash = params.get("hash");
        params.delete("hash");

        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join("\n");

        const secretKey = crypto
            .createHmac("sha256", "WebAppData")
            .update(env.TELEGRAM_BOT_TOKEN)
            .digest();

        const calculatedHash = crypto
            .createHmac("sha256", secretKey)
            .update(dataCheckString)
            .digest("hex");

        if (calculatedHash !== hash) {
            if (env.NODE_ENV === "development") {
                const userStr = params.get("user");
                if (userStr) {
                    req.telegramUser = JSON.parse(userStr);
                    return next();
                }
            }
            return res.status(401).json({ error: "Invalid init data hash" });
        }

        const userStr = params.get("user");
        if (userStr) {
            req.telegramUser = JSON.parse(userStr);
        }

        if (!req.telegramUser) {
            return res.status(401).json({ error: "User data missing from init data" });
        }

        const authDate = parseInt(params.get("auth_date") || "0");
        const now = Math.floor(Date.now() / 1000);
        if (now - authDate > 86400 && env.NODE_ENV !== "development") {
            return res.status(401).json({ error: "Auth data expired" });
        }

        next();
    } catch (err) {
        console.error("[MINIAPP] Auth error:", err);
        return res.status(401).json({ error: "Authentication failed" });
    }
}

router.use(validateInitData);

// ═══════════════════════════════════════════════════════════════
//  AUTH — Validate & return/create user
// ═══════════════════════════════════════════════════════════════

router.post("/auth", async (req: Request, res: Response) => {
    try {
        const tgUser = req.telegramUser;
        if (!tgUser) return res.status(401).json({ error: "No user" });

        // getOrCreateUser handles both lookup and creation
        const user = await db.getOrCreateUser(
            tgUser.id,
            tgUser.username,
            tgUser.first_name
        );

        // If user has no wallet yet (new user with bot wallet), derive one
        if (!user.wallet_address && ((user as any).wallet_type === 'bot' || !(user as any).wallet_type)) {
            try {
                const derived = wallet.deriveWallet(user.wallet_index);
                await db.updateUser(user.id, {
                    wallet_address: derived.address,
                    wallet_type: 'bot',
                } as any);
                user.wallet_address = derived.address;
                (user as any).wallet_type = 'bot';
                console.log(`[AUTH] Derived bot wallet for user ${user.id}: ${derived.address}`);
            } catch (walletErr: any) {
                console.error("[AUTH] Failed to derive wallet:", walletErr);
            }
        }

        res.json({ user });
    } catch (err: any) {
        console.error("[MINIAPP] Auth error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  WALLET — Balances, Send, Connect
// ═══════════════════════════════════════════════════════════════

router.get("/wallet/balances", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user?.wallet_address) {
            return res.json({ eth: "0", usdc: "0.00", usdt: "0.00", address: null, wallet_type: (user as any)?.wallet_type || 'bot' });
        }

        const balances = await wallet.getBalances(user.wallet_address);
        const vaultBaseUsdc = await escrow.getVaultBalance(user.wallet_address, env.USDC_ADDRESS, 'base');
        const vaultBscUsdc = await escrow.getVaultBalance(user.wallet_address, "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", 'bsc');

        const reservedBaseUsdc = await db.getReservedAmount(user.id, 'USDC', 'base');
        const reservedBscUsdc = await db.getReservedAmount(user.id, 'USDC', 'bsc');
        const reservedBaseUsdt = await db.getReservedAmount(user.id, 'USDT', 'base');
        const reservedBscUsdt = await db.getReservedAmount(user.id, 'USDT', 'bsc');

        res.json({
            ...balances,
            vault_base_usdc: vaultBaseUsdc,
            vault_bsc_usdc: vaultBscUsdc,
            vault_base_reserved: (reservedBaseUsdc + reservedBaseUsdt).toString(),
            vault_bsc_reserved: (reservedBscUsdc + reservedBscUsdt).toString(),
            wallet_type: (user as any).wallet_type || 'bot'
        });
    } catch (err: any) {
        console.error("[MINIAPP] Wallet balances error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/wallet/send", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user?.wallet_address) {
            return res.status(400).json({ error: "No wallet configured" });
        }

        // External wallets can't sign server-side
        if ((user as any).wallet_type === 'external') {
            return res.status(400).json({ error: "External wallets must send via your wallet app (MetaMask, etc.)" });
        }

        const { to, amount, token, chain } = req.body; // chain: 'base' | 'bsc'
        if (!to || !amount) {
            return res.status(400).json({ error: "Missing to/amount" });
        }

        if (amount <= 0 || amount > 100000) {
            return res.status(400).json({ error: "Invalid amount" });
        }

        const targetChain = chain || 'base';
        let txHash: string;

        if (token === "ETH" || token === "BNB") {
            txHash = await wallet.sendNative(user.wallet_index, to, amount, targetChain);
        } else {
            // Determine token address based on chain
            let tokenAddress = env.USDC_ADDRESS;
            if (targetChain === 'bsc') {
                tokenAddress = (token === "USDT") ? "0x55d398326f99059fF775485246999027B3197955" : "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
            } else {
                tokenAddress = (token === "USDT") ? env.USDT_ADDRESS : env.USDC_ADDRESS;
            }

            txHash = await wallet.sendToken(
                user.wallet_index,
                to,
                amount,
                tokenAddress,
                targetChain
            );
        }

        res.json({ txHash });
    } catch (err: any) {
        console.error("[MINIAPP] Send error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/wallet/connect", async (req: Request, res: Response) => {
    try {
        const { address } = req.body;
        if (!address) return res.status(400).json({ error: "Missing address" });

        // Validate Ethereum address format
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return res.status(400).json({ error: "Invalid Ethereum address" });
        }

        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        await db.updateUser(user.id, {
            wallet_address: address,
            wallet_type: 'external',
        } as any);

        res.json({ success: true });
    } catch (err: any) {
        console.error("[MINIAPP] Connect error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/wallet/bot", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const derived = wallet.deriveWallet(user.wallet_index);

        await db.updateUser(user.id, {
            wallet_address: derived.address,
            wallet_type: 'bot',
        } as any);

        res.json({ success: true, address: derived.address });
    } catch (err: any) {
        console.error("[MINIAPP] Switch to bot error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ═══ VAULT OPERATIONS (Custodial Wallets) ═══

router.post("/wallet/vault/deposit", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        if (user.wallet_type === 'external') return res.status(400).json({ error: "External wallets must deposit via frontend" });

        const { amount, token, chain } = req.body;
        if (!amount || !token) return res.status(400).json({ error: "Missing amount/token" });

        const targetChain = chain || 'base';
        let tokenAddress = env.USDC_ADDRESS;
        if (targetChain === 'bsc') {
            tokenAddress = (token === "USDT") ? "0x55d398326f99059fF775485246999027B3197955" : "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
        } else {
            tokenAddress = token === 'USDT' ? env.USDT_ADDRESS : env.USDC_ADDRESS;
        }

        const txHash = await wallet.depositToVault(user.wallet_index, amount.toString(), tokenAddress, targetChain);

        res.json({ txHash });
    } catch (err: any) {
        console.error("[MINIAPP] Vault deposit error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/wallet/vault/withdraw", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        if (user.wallet_type === 'external') return res.status(400).json({ error: "External wallets must withdraw via frontend" });

        const { amount, token, chain } = req.body;
        if (!amount || !token) return res.status(400).json({ error: "Missing amount/token" });

        const targetChain = chain || 'base';
        let tokenAddress = env.USDC_ADDRESS;
        if (targetChain === 'bsc') {
            tokenAddress = (token === "USDT") ? "0x55d398326f99059fF775485246999027B3197955" : "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
        } else {
            tokenAddress = token === 'USDT' ? env.USDT_ADDRESS : env.USDC_ADDRESS;
        }

        // ════ VALIDATION: Prevent Withdrawal of Reserved Funds ════
        const balanceStr = await escrow.getVaultBalance(user.wallet_address!, tokenAddress, targetChain as any);
        const physicalBalance = parseFloat(balanceStr);
        const reserved = await db.getReservedAmount(user.id, token, targetChain);
        const available = physicalBalance - reserved;

        const withdrawAmount = parseFloat(amount.toString());
        if (withdrawAmount > available) {
            return res.status(400).json({
                error: `Insufficient Available Balance! You have ${physicalBalance} ${token}, but ${reserved} ${token} is reserved for your active ads. Max withdrawable: ${available.toFixed(2)} ${token}.`
            });
        }

        const txHash = await wallet.withdrawFromVault(user.wallet_index, withdrawAmount.toString(), tokenAddress, targetChain);

        res.json({ txHash });
    } catch (err: any) {
        console.error("[MINIAPP] Vault withdraw error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  ORDERS — Browse, Create, Cancel
// ═══════════════════════════════════════════════════════════════

router.get("/orders/:id", async (req: Request, res: Response) => {
    try {
        const order = await db.getOrderById(req.params.id as string);
        if (!order) return res.status(404).json({ error: "Order not found" });
        res.json({ order });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/orders", async (req: Request, res: Response) => {
    try {
        const type = typeof req.query.type === "string" ? req.query.type : undefined;
        // Increase limit slightly to account for filtered items
        const rawOrders = await db.getActiveOrders(type, undefined, 30);

        // JIT LIQUIDITY CHECK (Batch)
        // Only check sell orders where reliability is critical
        let orders = rawOrders;
        if (type === 'sell' || !type) {
            const sellOrders = rawOrders.filter(o => o.type === 'sell');
            if (sellOrders.length > 0) {
                const invalidIds = await escrow.validateSellerBalances(sellOrders);
                if (invalidIds.size > 0) {
                    console.log(`[Orders] Filtering ${invalidIds.size} ghost ads:`, Array.from(invalidIds));
                    orders = rawOrders.filter(o => !invalidIds.has(o.id));

                    // Optional: Trigger background cleanup for these invalid ads?
                    // For now, just hide them. The background job will kill them eventually.
                }
            }
        }

        res.json({ orders });
    } catch (err: any) {
        console.error("[MINIAPP] Orders error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.get("/orders/mine", async (req: Request, res: Response) => {
    try {
        if (!req.telegramUser) {
            return res.status(401).json({ error: "User not identified" });
        }

        const tgId = Number(req.telegramUser.id);
        const user = await db.getUserByTelegramId(tgId);
        console.log(`[MINIAPP] /orders/mine: tg_id=${tgId} user_found=${!!user}`);

        if (!user) {
            return res.json({ orders: [] });
        }

        const orders = await db.getUserOrders(user.id);
        // Manually inject user info for the UI
        const mappedOrders = orders.map(o => ({
            ...o,
            username: user.username,
            trust_score: user.trust_score,
            wallet_address: user.wallet_address
        }));

        console.log(`[MINIAPP] /orders/mine: Found ${orders.length} orders for ${user.username}`);
        res.json({
            orders: mappedOrders,
            debug_user: { id: user.id, tg_id: tgId, username: user.username }
        });
    } catch (err: any) {
        console.error("/orders/mine error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Temporary health/stats for debugging
router.get("/debug/status", async (req: Request, res: Response) => {
    res.json({
        ok: true,
        env: env.NODE_ENV,
        node: process.version,
        timestamp: new Date().toISOString(),
        v: "v1.2.3" // Version tracker
    });
});

router.get("/debug/db-dump", async (req: Request, res: Response) => {
    try {
        const users = await db.getUserByTelegramId(123456789); // Check user
        const { data: allOrders } = await (db as any).getClient().from("orders").select("*");
        res.json({
            target_user: users,
            orders: allOrders
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/orders", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const { type, token, amount, rate, payment_methods, expires_in, chain } = req.body;
        if (!type || !token || !amount || !rate) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const orderChain = chain || 'base';
        const parsedAmount = parseFloat(amount);
        const parsedRate = parseFloat(rate);

        // ... (existing checks)

        let expiresAt: string | undefined;
        if (expires_in) {
            const minutes = parseInt(expires_in);
            if (minutes > 0) {
                const now = new Date();
                now.setMinutes(now.getMinutes() + minutes);
                expiresAt = now.toISOString();
            }
        }

        // ═══ VALIDATION: Sell Orders ═══
        if (type === 'sell') {
            // 1. Vault only supports ERC20 (USDC/USDT)
            if (token !== 'USDC' && token !== 'USDT') {
                return res.status(400).json({ error: "Only USDC/USDT sell ads are supported on Mini App currently." });
            }

            // 2. Check Vault Balance (Anti-Scam / liquidity check)
            let tokenAddress = env.USDC_ADDRESS;
            if (orderChain === 'bsc') {
                tokenAddress = (token === "USDT") ? "0x55d398326f99059fF775485246999027B3197955" : "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
            } else {
                tokenAddress = (token === "USDT") ? env.USDT_ADDRESS : env.USDC_ADDRESS;
            }

            // Check if user has enough funds in Vault
            const balanceStr = await escrow.getVaultBalance(user.wallet_address!, tokenAddress, orderChain as any);
            const physicalBalance = parseFloat(balanceStr);

            // Subtract reserved amounts from existing active sell ads
            const reserved = await db.getReservedAmount(user.id, token, orderChain);
            const available = physicalBalance - reserved;

            if (available < parsedAmount) {
                return res.status(400).json({
                    error: `Insufficient Available Vault Balance! You have ${physicalBalance} ${token}, but ${reserved} ${token} is already reserved for your other active ads. Available: ${available.toFixed(2)} ${token}.`
                });
            }
        }

        const order = await db.createOrder({
            user_id: user.id,
            type,
            token: token || "USDC",
            chain: orderChain,
            amount: parsedAmount,
            rate: parsedRate,
            fiat_currency: "INR",
            payment_methods: payment_methods || ["UPI"],
            // payment_details: {}, // Optional in schema

        });

        res.json({ order });
    } catch (err: any) {
        console.error("[MINIAPP] Create order error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/orders/:id/cancel", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const order = await db.getOrderById(req.params.id as string);
        if (!order) return res.status(404).json({ error: "Order not found" });
        if (order.user_id !== user.id) return res.status(403).json({ error: "Not your order" });

        await db.cancelOrder(req.params.id as string);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  TRADES — List, Create, Status Updates
// ═══════════════════════════════════════════════════════════════

router.get("/trades", async (req: Request, res: Response) => {
    try {
        if (!req.telegramUser) {
            return res.status(401).json({ error: "User not identified" });
        }

        const tgId = Number(req.telegramUser.id);
        const user = await db.getUserByTelegramId(tgId);

        if (!user) {
            return res.json({ trades: [] });
        }

        const trades = await db.getUserTrades(user.id);
        console.log(`[MINIAPP] /trades: Found ${trades.length} trades for ${user.username}`);
        res.json({ trades });
    } catch (err: any) {
        console.error("/trades error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.get("/trades/:id", async (req: Request, res: Response) => {
    try {
        const trade = await db.getTradeById(req.params.id as string);
        if (!trade) return res.status(404).json({ error: "Trade not found" });
        res.json({ trade });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/trades", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const { order_id, amount } = req.body;
        if (!order_id) return res.status(400).json({ error: "Missing order_id" });

        const order = await db.getOrderById(order_id);
        if (!order) return res.status(404).json({ error: "Order not found" });
        if (order.status !== "active") return res.status(400).json({ error: "Order is no longer active" });

        // Prevent self-trade
        if (order.user_id === user.id) {
            return res.status(400).json({ error: "Cannot trade with your own order" });
        }

        const tradeAmount = amount || order.amount;
        if (tradeAmount <= 0 || tradeAmount > order.amount - (order.filled_amount || 0)) {
            return res.status(400).json({ error: "Invalid trade amount" });
        }

        // ═══ DETERMINE SELLER & BUYER ═══
        const sellerId = order.type === "sell" ? order.user_id : user.id;
        const buyerId = order.type === "sell" ? user.id : order.user_id;
        const seller = sellerId === user.id ? user : await db.getUserById(sellerId);
        const buyer = buyerId === user.id ? user : await db.getUserById(buyerId);

        if (!seller || !buyer) {
            return res.status(400).json({ error: "Could not find trade parties" });
        }

        // ═══ BALANCE CHECK: Verify seller still has enough funds ═══
        if (!seller.wallet_address) {
            return res.status(400).json({ error: "Seller has no wallet configured" });
        }

        // Vault only supports ERC20
        if (order.token !== 'USDC' && order.token !== 'USDT') {
            return res.status(400).json({ error: "Only USDC/USDT trades are supported via Vault." });
        }

        const tokenAddress = (order.token === "USDT") ? env.USDT_ADDRESS : env.USDC_ADDRESS;

        // Atomically fill the order to prevent double-matching
        const filled = await db.fillOrder(order_id, tradeAmount);
        if (!filled) {
            return res.status(409).json({ error: "Order already filled or no longer active" });
        }

        const fiatAmount = tradeAmount * (1 - (env.FEE_PERCENTAGE / 2)) * order.rate; // 0.5% Seller Fee deducted from fiat
        const feeAmount = tradeAmount * env.FEE_PERCENTAGE;      // Total Fee (usually 1%)
        const buyerReceives = tradeAmount - feeAmount; // Gets 99% of locked amount (split 1% total fee)

        try {
            // ═══ ESCROW: Lock seller's funds on-chain ═══


            const sellerWalletType = (seller as any).wallet_type || 'bot';

            // ═══ P2P TRADING FLOW (VAULT BASED) ═══

            let escrowTxHash = "";
            let onChainTradeId = "";
            let lockedAt: string | null = null;

            // 1. Check Seller's Vault Balance
            try {
                let tokenAddress = env.USDC_ADDRESS;
                if (order.chain === 'bsc') {
                    tokenAddress = (order.token === "USDT") ? "0x55d398326f99059fF775485246999027B3197955" : "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
                } else {
                    tokenAddress = (order.token === "USDT") ? env.USDT_ADDRESS : env.USDC_ADDRESS;
                }

                const balance = await escrow.getVaultBalance(seller.wallet_address!, tokenAddress, order.chain as any);
                if (parseFloat(balance) < tradeAmount) {
                    // ROLLBACK FILL
                    await db.revertFillOrder(order_id, tradeAmount);
                    return res.status(400).json({
                        error: `Seller (you?) has insufficient Vault balance (${balance}). Please Deposit ${tradeAmount} ${order.token} to Vault first.`
                    });
                }

                // 2. Relayer locks funds from Vault (Amount)
                // Contract takes 1% (FEE_BPS=100) on release.
                // Buyer pays fiat for Amount * 0.995.
                // Buyer receives Amount * 0.99.

                console.log(`[TRADES] Relayer creating trade for ${seller.wallet_address} -> ${buyer.wallet_address} on ${order.chain}. Lock: ${tradeAmount}`);
                const tradeIdStr = await escrow.createRelayedTrade(
                    seller.wallet_address!,
                    buyer.wallet_address!,
                    tokenAddress,
                    tradeAmount.toString(),
                    3600, // 1 hour
                    order.chain as any
                );
                onChainTradeId = tradeIdStr as any;

                escrowTxHash = "relayed_" + onChainTradeId;
                lockedAt = new Date().toISOString();

            } catch (err: any) {
                console.error("[MINIAPP] Relayed trade creation failed:", err);
                // ROLLBACK FILL
                await db.revertFillOrder(order_id, tradeAmount);
                return res.status(500).json({ error: "Failed to create trade on-chain: " + err.message });
            }

            const trade = await db.createTrade({
                order_id,
                seller_id: seller.id,
                buyer_id: buyer.id,
                amount: tradeAmount,
                token: order.token,
                fiat_amount: fiatAmount as any,
                fiat_currency: "INR",
                rate: order.rate,
                status: "in_escrow", // Always in_escrow because usage of Vault
                escrow_tx_hash: escrowTxHash as any,
                on_chain_trade_id: onChainTradeId as any,
                escrow_locked_at: lockedAt as any,
                chain: order.chain,
            });

            res.json({ trade });

            // BACKGROUND NOTIFICATIONS
            const coin = trade.token;
            const amountStr = trade.amount;
            const fiat = trade.fiat_amount;

            // 1. Notify Seller
            await notifyTradeUpdate(seller.id,
                `🤝 <b>Trade Matched!</b>\n\nBuyer <b>${buyer.first_name || 'User'}</b> is ready to buy <b>${amountStr} ${coin}</b> for <b>₹${parseFloat(fiat.toString()).toLocaleString()}</b>.\n\nFunds are locked in Escrow. Please wait for payment UTR.`
            );

            // 2. Notify Buyer
            await notifyTradeUpdate(buyer.id,
                `💸 <b>Funds in Escrow!</b>\n\nYou are buying <b>${amountStr} ${coin}</b> from <b>${seller.first_name || 'User'}</b>.\n\nPlease transfer <b>₹${parseFloat(fiat.toString()).toLocaleString()}</b> to the seller's UPI and submit the UTR.`
            );
        } catch (tradeErr) {
            // Revert the fill if trade creation fails
            await db.revertFillOrder(order_id, tradeAmount);
            throw tradeErr;
        }
    } catch (err: any) {
        console.error("[MINIAPP] Create trade error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ═══ LOCK FUNDS (External Wallets) ═══
router.post("/trades/:id/lock", async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const { txHash, tradeId } = req.body as { txHash: string; tradeId?: string }; // on-chain trade ID if available
        const user = await db.getUserByTelegramId(req.telegramUser!.id);

        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const trade = await db.getTradeById(id);
        if (!trade) return res.status(404).json({ error: "Trade not found" });

        // Only seller can lock funds
        if (trade.seller_id !== user.id) {
            return res.status(403).json({ error: "Only the seller can lock funds" });
        }

        if (trade.status !== "waiting_for_escrow" && trade.status !== "matched") {
            return res.status(400).json({ error: "Trade is not waiting for lock" });
        }

        await db.updateTrade(id, {
            status: "in_escrow",
            escrow_tx_hash: txHash,
            on_chain_trade_id: tradeId ? parseInt(tradeId) : undefined,
            escrow_locked_at: new Date().toISOString(),
        });

        const updated = await db.getTradeById(id);
        res.json(updated);

        // NOTIFY BUYER
        if (updated) {
            await notifyTradeUpdate(updated.buyer_id,
                `🔒 <b>Seller Locked Funds!</b>\n\nSeller <b>${user.first_name || 'User'}</b> has locked the crypto in Escrow.\n\nYou can now safely transfer <b>₹${updated.fiat_amount}</b> and submit the UTR.`
            );
        }
    } catch (err: any) {
        console.error("[MINIAPP] Lock confirm error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/trades/:id/confirm-payment", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const { utr } = req.body;
        if (!utr || !/^\d{12}$/.test(utr)) {
            return res.status(400).json({ error: "A valid 12-digit UTR/Reference number is required." });
        }

        const trade = await db.getTradeById(req.params.id as string);
        if (!trade) return res.status(404).json({ error: "Trade not found" });
        if (trade.buyer_id !== user.id) return res.status(403).json({ error: "Only the buyer can confirm payment" });
        if (trade.status !== "in_escrow") return res.status(400).json({ error: "Trade not in escrow state" });

        // Double-Proof Protection
        const isUsed = await db.isUTRUsed(utr);
        if (isUsed) {
            return res.status(400).json({ error: "This UTR has already been used in another trade!" });
        }

        // Save proof
        await db.savePaymentProof({
            trade_id: trade.id,
            user_id: user.id,
            utr: utr,
            amount: trade.fiat_amount,
            receiver_upi: "", // Optionally fetch from seller if needed for logs
            timestamp: new Date().toISOString(),
        });

        await db.updateTrade(req.params.id as string, {
            status: "fiat_sent",
            fiat_sent_at: new Date().toISOString() as any,
            auto_release_at: new Date(Date.now() + parseInt(env.AUTO_RELEASE_SECONDS) * 1000).toISOString() as any,
        });

        res.json({ success: true });

        // NOTIFY SELLER
        await notifyTradeUpdate(trade.seller_id,
            `💰 <b>Payment Reported!</b>\n\nBuyer <b>${user.first_name || 'User'}</b> has reported paying <b>₹${trade.fiat_amount}</b>.\n\nUTR: <code>${utr}</code>\n\n<b>Action Required:</b> Verify the payment in your bank app and release the crypto.`
        );
    } catch (err: any) {
        console.error("[MINIAPP] Confirm payment error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/trades/:id/confirm-receipt", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const trade = await db.getTradeById(req.params.id as string);
        if (!trade) return res.status(404).json({ error: "Trade not found" });
        if (trade.seller_id !== user.id) return res.status(403).json({ error: "Only the seller can confirm receipt" });
        if (trade.status !== "fiat_sent") return res.status(400).json({ error: "Buyer hasn't confirmed fiat sent yet" });

        // Release escrow on-chain if trade has on_chain_trade_id
        let releaseTxHash: string | null = null;
        if (trade.on_chain_trade_id) {
            try {
                releaseTxHash = await escrow.release(trade.on_chain_trade_id, trade.chain as any);
            } catch (escrowErr: any) {
                console.error("[MINIAPP] Escrow release failed:", escrowErr);
                return res.status(500).json({ error: "Failed to release escrow: " + escrowErr.message });
            }
        }

        await db.updateTrade(req.params.id as string, {
            status: "completed",
            fiat_confirmed_at: new Date().toISOString() as any,
            completed_at: new Date().toISOString() as any,
            release_tx_hash: releaseTxHash as any,
        });

        // Update trust scores for both parties
        await db.completeUserTrade(trade.buyer_id, true);
        await db.completeUserTrade(trade.seller_id, true);

        res.json({ success: true, release_tx_hash: releaseTxHash });

        // NOTIFY BUYER
        await notifyTradeUpdate(trade.buyer_id,
            `🎉 <b>Trade Completed!</b>\n\nSeller <b>${user.first_name || 'User'}</b> has released <b>${trade.amount} ${trade.token}</b> to your Vault.\n\nThank you for trading with P2P Kerala! 🚀`
        );

        // NOTIFY GROUP (FOMO)
        try {
            const originalOrder = await db.getOrderById(trade.order_id);
            if (originalOrder) {
                // Add seller username to trade object for the broadcast msg
                const tradeWithUsername = { ...trade, seller_username: user.username };
                await broadcastTradeSuccess(tradeWithUsername, originalOrder);
            }
        } catch (e) {
            console.error("FOMO Broadcast error:", e);
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/trades/:id/dispute", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const trade = await db.getTradeById(req.params.id as string);
        if (!trade) return res.status(404).json({ error: "Trade not found" });
        if (trade.buyer_id !== user.id && trade.seller_id !== user.id) {
            return res.status(403).json({ error: "Not a party to this trade" });
        }
        if (!['in_escrow', 'fiat_sent'].includes(trade.status)) {
            return res.status(400).json({ error: "Cannot dispute in current state" });
        }

        const { reason } = req.body;
        await db.updateTrade(req.params.id as string, {
            status: "disputed",
            dispute_reason: reason || "Dispute raised via Mini App",
        });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  PROFILE — Get & Update
// ═══════════════════════════════════════════════════════════════

router.get("/profile", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ user });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.put("/profile", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const { upi_id } = req.body;
        if (upi_id !== undefined) {
            await db.updateUser(user.id, { upi_id } as any);
        }

        const updatedUser = await db.getUserByTelegramId(req.telegramUser!.id);
        res.json({ user: updatedUser });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  BRIDGE — Quote via LI.FI
// ═══════════════════════════════════════════════════════════════

router.post("/bridge/quote", async (req: Request, res: Response) => {
    try {
        const { fromChainId, toChainId, fromToken, toToken, amount } = req.body;

        const response = await fetch(
            `https://li.quest/v1/quote?fromChain=${fromChainId}&toChain=${toChainId}&fromToken=${fromToken === "USDC" ? "USDC" : fromToken}&toToken=${toToken === "USDC" ? "USDC" : toToken}&fromAmount=${amount}&fromAddress=0x0000000000000000000000000000000000000000`
        );

        if (!response.ok) {
            throw new Error("Failed to get bridge quote");
        }

        const quote = await response.json();
        res.json(quote);
    } catch (err: any) {
        console.error("[MINIAPP] Bridge quote error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  STATS — Platform Stats
// ═══════════════════════════════════════════════════════════════

router.get("/stats", async (req: Request, res: Response) => {
    try {
        const stats = await db.getStats();
        res.json({
            total_users: stats.total_users,
            total_volume_usdc: stats.total_volume_usdc || 0,
            active_orders: stats.active_orders,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export { router as miniappRouter };
