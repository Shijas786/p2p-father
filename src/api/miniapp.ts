// ═══════════════════════════════════════════════════════════════
//  MINI APP API — Express Router for Telegram Mini App
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";
import { db } from "../db/client";
import { wallet } from "../services/wallet";
import { escrow } from "../services/escrow";
import { bot, broadcastTradeSuccess, broadcastAd } from "../bot";

// Multer for in-memory file uploads (max 5MB)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Supabase client for storage
const supabaseStorage = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

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
    is_admin?: boolean;
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

    // Dev mode bypass — ONLY when explicitly in development AND no init data provided
    if (!initData && env.NODE_ENV === "development") {
        console.warn("[AUTH] ⚠️ DEV MODE BYPASS: Using test user. NEVER deploy with NODE_ENV=development!");
        req.telegramUser = {
            id: 723338915,
            first_name: "Cryptowolf07",
            username: "Cryptowolf07",
            // Added for dev mode mock user
            is_admin: true,
        } as TelegramUser;
        return next();
    }

    if (!initData) {
        console.warn(`[AUTH] ❌ Missing initData | IP: ${req.ip} | UA: ${req.headers['user-agent']?.slice(0, 80)}`);
        return res.status(401).json({ error: "Please open this app through the Telegram bot" });
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
        } // Fix: Missing closing brace for the if statement

        res.json({
            user: {
                ...user,
                is_admin: env.ADMIN_IDS.includes(Number(user.telegram_id)),
                admin_ids: env.ADMIN_IDS
            }
        });
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
            return res.json({
                eth: "0",
                usdc: "0.00",
                usdt: "0.00",
                bnb: "0.0000",
                address: null,
                wallet_type: (user as any)?.wallet_type || 'bot'
            });
        }

        const balances = await wallet.getBalances(user.wallet_address);
        const vaultBaseUsdc = await escrow.getVaultBalance(user.wallet_address, env.USDC_ADDRESS, 'base');
        const vaultBscUsdc = await escrow.getVaultBalance(user.wallet_address, "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", 'bsc');
        const vaultBaseUsdt = await escrow.getVaultBalance(user.wallet_address, env.USDT_ADDRESS, 'base');
        const vaultBscUsdt = await escrow.getVaultBalance(user.wallet_address, "0x55d398326f99059fF775485246999027B3197955", 'bsc');
        const vaultBscBnb = await escrow.getVaultBalance(user.wallet_address, "0x0000000000000000000000000000000000000000", 'bsc');

        const reservedBaseUsdc = await db.getReservedAmount(user.id, 'USDC', 'base');
        const reservedBscUsdc = await db.getReservedAmount(user.id, 'USDC', 'bsc');
        const reservedBaseUsdt = await db.getReservedAmount(user.id, 'USDT', 'base');
        const reservedBscUsdt = await db.getReservedAmount(user.id, 'USDT', 'bsc');
        const reservedBscBnb = await db.getReservedAmount(user.id, 'BNB', 'bsc');

        res.json({
            ...balances,
            vault_base_usdc: vaultBaseUsdc,
            vault_bsc_usdc: vaultBscUsdc,
            vault_base_usdt: vaultBaseUsdt,
            vault_bsc_usdt: vaultBscUsdt,
            vault_bsc_bnb: vaultBscBnb,
            vault_base_reserved: (reservedBaseUsdc + reservedBaseUsdt).toString(),
            vault_bsc_reserved: (reservedBscUsdc + reservedBscUsdt + reservedBscBnb).toString(),

            // Detailed reserved breakdown for UI
            reserved_base_usdc: reservedBaseUsdc.toString(),
            reserved_base_usdt: reservedBaseUsdt.toString(),
            reserved_bsc_usdc: reservedBscUsdc.toString(),
            reserved_bsc_usdt: reservedBscUsdt.toString(),
            reserved_bsc_bnb: reservedBscBnb.toString(),

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
            txHash = await wallet.sendNative(user.wallet_index, to, amount.toString(), targetChain);
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
                amount.toString(),
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
            if (token === 'BNB') {
                tokenAddress = "0x0000000000000000000000000000000000000000";
            } else {
                tokenAddress = (token === "USDT") ? "0x55d398326f99059fF775485246999027B3197955" : "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
            }
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

        const txHash = await wallet.withdrawFromVault(user.wallet_index, amount.toString(), tokenAddress, targetChain);

        res.json({ txHash });
    } catch (err: any) {
        console.error("[MINIAPP] Vault withdraw error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  ORDERS — Browse, Create, Cancel
// ═══════════════════════════════════════════════════════════════

router.get("/orders/mine", async (req: Request, res: Response) => {
    try {
        if (!req.telegramUser) {
            return res.status(401).json({ error: "User not identified" });
        }

        const tgId = Number(req.telegramUser.id);
        const user = await db.getUserByTelegramId(tgId);

        if (!user) {
            return res.json({ orders: [] });
        }

        const orders = await db.getUserOrders(user.id);

        const mappedOrders = await Promise.all(orders.map(async (o) => {
            const { data: userData } = await (db as any).getClient()
                .from("users")
                .select("username, telegram_id, completed_trades")
                .eq("id", o.user_id)
                .single();

            return {
                ...o,
                username: userData?.username || "Unknown",
                user_telegram_id: userData?.telegram_id,
                completed_trades: userData?.completed_trades || 0
            };
        }));

        console.log(`[MINIAPP] /orders/mine: Found ${orders.length} orders for user ${user.id}`);
        res.json({ orders: mappedOrders });
    } catch (err: any) {
        console.error("/orders/mine error:", err);
        res.status(500).json({ error: err.message });
    }
});

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
        const rawOrders = await db.getActiveOrders(type, undefined, 50);

        // Filter out dust orders (available < min trade amount)
        let orders = rawOrders.filter(o => {
            const available = o.amount - (o.filled_amount || 0);
            const minAmount = o.token === 'BNB' ? 0.001 : 1.0;
            return available >= (minAmount - 0.000001);
        });

        // JIT LIQUIDITY CHECK (Batch)
        // Only check sell orders where reliability is critical
        if (type === 'sell' || !type) {
            const sellOrders = orders.filter(o => o.type === 'sell');
            if (sellOrders.length > 0) {
                const invalidIds = await escrow.validateSellerBalances(sellOrders);
                if (invalidIds.size > 0) {
                    console.log(`[Orders] Filtering ${invalidIds.size} ghost ads:`, Array.from(invalidIds));
                    orders = orders.filter(o => !invalidIds.has(o.id));

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

// Moved /orders/mine above /orders/:id

// Debug endpoints (dev only)
if (env.NODE_ENV === 'development') {
    router.get("/debug/status", async (req: Request, res: Response) => {
        res.json({
            ok: true,
            env: env.NODE_ENV,
            node: process.version,
            timestamp: new Date().toISOString(),
            v: "v1.2.3"
        });
    });

    router.get("/debug/db-dump", async (req: Request, res: Response) => {
        try {
            const users = await db.getUserByTelegramId(723338915);
            const { data: allOrders } = await (db as any).getClient().from("orders").select("*");
            res.json({
                target_user: users,
                orders: allOrders
            });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });
}

router.post("/orders", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        // Require at least one payment method set up
        if (!user.upi_id && !user.phone_number) {
            return res.status(400).json({
                error: "Please set up your UPI ID or Phone Number in your Profile before creating an ad."
            });
        }

        const { type, token, amount, rate, payment_methods, expires_in, chain } = req.body;
        if (!type || !token || !amount || !rate) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const orderChain = chain || 'base';
        const parsedAmount = parseFloat(amount);
        const parsedRate = parseFloat(rate);

        // Input validation
        const minAmount = token === 'BNB' ? 0.001 : 1.0;
        if (isNaN(parsedAmount) || parsedAmount < minAmount || parsedAmount > 100000) {
            return res.status(400).json({ error: `Amount must be between ${minAmount} and 100,000` });
        }
        const maxRate = token === 'BNB' ? 100000 : 1000;
        if (isNaN(parsedRate) || parsedRate <= 0 || parsedRate > maxRate) {
            return res.status(400).json({ error: `Rate must be between 0.01 and ${maxRate.toLocaleString()} INR per token` });
        }
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
            // 1. Supported tokens
            if (token !== 'USDC' && token !== 'USDT' && token !== 'BNB') {
                return res.status(400).json({ error: "Only USDC, USDT, and BNB sell ads are supported." });
            }

            // 2. Check Vault Balance (Anti-Scam / liquidity check)
            let tokenAddress = env.USDC_ADDRESS;
            if (orderChain === 'bsc') {
                if (token === 'BNB') {
                    tokenAddress = "0x0000000000000000000000000000000000000000";
                } else {
                    tokenAddress = (token === "USDT") ? "0x55d398326f99059fF775485246999027B3197955" : "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
                }
            } else {
                tokenAddress = (token === "USDT") ? env.USDT_ADDRESS : env.USDC_ADDRESS;
            }

            // Check if user has enough funds in Vault
            const balanceStr = await escrow.getVaultBalance(user.wallet_address!, tokenAddress, orderChain as any);
            const physicalBalance = parseFloat(balanceStr);

            // Subtract reserved amounts from existing active sell ads
            const reserved = await db.getReservedAmount(user.id, token, orderChain);
            const available = physicalBalance - reserved;

            if (available < (parsedAmount - 0.000001)) {
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

        // Broadcast new ad to all groups
        broadcastAd(order, user).catch(console.error);
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
        if (order.status !== 'active') return res.status(400).json({ error: "Order is not active" });

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
        res.json({ trades });
    } catch (err: any) {
        console.error("/trades error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.get("/trades/mine", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const trades = await db.getUserTrades(user.id);
        res.json({ trades });
    } catch (err: any) {
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
        const minAmount = order.token === 'BNB' ? 0.001 : 1.0;
        // Float precision fix (1 - 0.000001 < 1.0)
        if (tradeAmount < (minAmount - 0.000001)) {
            return res.status(400).json({ error: `Minimum trade amount is ${minAmount} ${order.token}` });
        }
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

        // Vault support
        if (order.token !== 'USDC' && order.token !== 'USDT' && order.token !== 'BNB') {
            return res.status(400).json({ error: "Unsupported token for trade via Vault." });
        }


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
            const receiveAddress = buyer.receive_address || buyer.wallet_address;
            if (!receiveAddress) {
                return res.status(400).json({ error: "Buyer has no receive address configured" });
            }

            let escrowTxHash = "";
            let onChainTradeId = "";
            let lockedAt: string | null = null;

            // 1. Check Seller's Vault Balance
            try {
                let tokenAddress = env.USDC_ADDRESS;
                if (order.chain === 'bsc') {
                    if (order.token === 'BNB') {
                        tokenAddress = "0x0000000000000000000000000000000000000000";
                    } else {
                        tokenAddress = (order.token === "USDT") ? "0x55d398326f99059fF775485246999027B3197955" : "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
                    }
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

                console.log(`[TRADES] Relayer creating trade for ${seller.wallet_address} -> ${receiveAddress} on ${order.chain}. Lock: ${tradeAmount}`);
                const tradeIdStr = await escrow.createRelayedTrade(
                    seller.wallet_address!,
                    receiveAddress,
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
                chain: order.chain,
                buyer_custom_address: receiveAddress,
                fiat_amount: fiatAmount as any,
                fiat_currency: "INR",
                rate: order.rate,
                status: "in_escrow",
                fee_amount: feeAmount as any,
                fee_percentage: env.FEE_PERCENTAGE as any,
                buyer_receives: buyerReceives as any,
                escrow_tx_hash: escrowTxHash as any,
                on_chain_trade_id: onChainTradeId as any,
                escrow_locked_at: lockedAt as any,
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

        const trade = await db.getTradeById(req.params.id as string);
        if (!trade) return res.status(404).json({ error: "Trade not found" });
        if (trade.buyer_id !== user.id) return res.status(403).json({ error: "Only the buyer can confirm payment" });
        if (trade.status !== "in_escrow") return res.status(400).json({ error: "Trade not in escrow state" });

        // UTR duplicate check (only if UTR is provided and real)
        if (utr && utr !== "NOT_PROVIDED") {
            const isUsed = await db.isUTRUsed(utr);
            if (isUsed) {
                return res.status(400).json({ error: "This UTR has already been used in another trade!" });
            }
        }

        // Save proof
        await db.savePaymentProof({
            trade_id: trade.id,
            user_id: user.id,
            utr: utr || "NOT_PROVIDED",
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
            `💰 <b>Payment Reported!</b>\n\nBuyer <b>${user.first_name || 'User'}</b> has reported paying <b>₹${trade.fiat_amount}</b>.\n\nUTR: <code>${utr || 'Not provided'}</code>\n\n<b>Action Required:</b> Verify the payment in your bank app and release the crypto.`
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
        // Pass amount and other party ID for points calculation
        await db.completeUserTrade(trade.buyer_id, true, trade.amount, trade.seller_id);
        await db.completeUserTrade(trade.seller_id, true, trade.amount, trade.buyer_id);

        res.json({ success: true, release_tx_hash: releaseTxHash });

        // NOTIFY BUYER
        await notifyTradeUpdate(trade.buyer_id,
            `🎉 <b>Trade Completed!</b>\n\nSeller <b>${user.first_name || 'User'}</b> has released <b>${trade.amount} ${trade.token}</b> to your Vault.\n\nThank you for trading with P2PFather! 🚀`
        );

        // NOTIFY GROUP (FOMO)
        try {
            const originalOrder = await db.getOrderById(trade.order_id);
            const buyerUser = await db.getUserById(trade.buyer_id);
            const tradeWithUsername = {
                ...trade,
                seller_username: user.username,
                buyer_username: buyerUser?.username || buyerUser?.first_name || 'Buyer',
                release_tx_hash: releaseTxHash || trade.release_tx_hash,
            };
            await broadcastTradeSuccess(tradeWithUsername, originalOrder || trade);
        } catch (e) {
            console.error("FOMO Broadcast error:", e);
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Helper to notify all admins
async function notifyAdmins(message: string) {
    if (env.ADMIN_IDS.length === 0) return;
    for (const adminId of env.ADMIN_IDS) {
        try {
            await bot.api.sendMessage(adminId, message, { parse_mode: "HTML" });
        } catch (e) {
            console.error(`[NOTIFY] Failed to notify admin ${adminId}:`, e);
        }
    }
}

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
        const previousStatus = trade.status; // capture before updating
        const stageInfo = previousStatus === 'in_escrow' ? '[Escrow Locked - No fiat sent]' : '[Fiat Sent]';
        const isSeller = trade.seller_id === user.id;
        const role = isSeller ? 'Seller' : 'Buyer';
        const disputeReason = `${stageInfo} ${role} @${user.username || user.first_name}: ${reason || "No reason provided"}`;

        await db.updateTrade(req.params.id as string, {
            status: "disputed",
            dispute_reason: disputeReason,
        });

        // Auto-post system message to trade chat
        await db.createTradeMessage({
            trade_id: trade.id,
            user_id: user.id,
            message: `⚠️ Dispute raised by ${role}. Reason: ${reason || "No reason provided"}. Admin has been notified and will join this chat shortly.`,
            type: "system"
        });

        // Human-readable stage info for admin notification
        const stageLabel = previousStatus === 'in_escrow'
            ? '🔒 Escrow Locked — Buyer never sent fiat'
            : '💸 Fiat Sent — Buyer claims payment sent';
        const totalFiat = (trade.amount * trade.rate).toLocaleString(undefined, { maximumFractionDigits: 0 });

        // NOTIFY ADMINS with full context
        await notifyAdmins(
            `🚨 <b>DISPUTE RAISED!</b>\n\n` +
            `Trade: <code>${trade.id}</code>\n` +
            `Amount: <b>${trade.amount} ${trade.token}</b> (₹${totalFiat})\n\n` +
            `📍 Stage: ${stageLabel}\n` +
            `👤 Raised by: ${role} @${user.username || user.first_name}\n` +
            `👥 Seller: @${(trade as any).seller_username || 'Unknown'} | Buyer: @${(trade as any).buyer_username || 'Unknown'}\n` +
            `📝 Reason: ${reason || "No reason provided"}\n\n` +
            `<a href="https://t.me/P2PKeralaBot/app?startapp=trade_${trade.id}">View Trade</a>`
        );

        // NOTIFY the other party about dispute
        const otherPartyId = trade.buyer_id === user.id ? trade.seller_id : trade.buyer_id;
        await notifyTradeUpdate(otherPartyId,
            `⚠️ <b>Dispute Raised!</b>\n\nYour trade partner has raised a dispute on trade <code>${trade.id.slice(0, 8)}</code>.\n\nReason: ${reason || "No reason provided"}\n\nPlease provide evidence in the trade chat. Admin will join shortly.`
        );

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/trades/:id/refund", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const trade = await db.getTradeById(req.params.id as string);
        if (!trade) return res.status(404).json({ error: "Trade not found" });

        // STRICTLY RESTRICT TO ADMINS ONLY
        // Sellers cannot refund themselves anymore for safety.
        const isAdmin = env.ADMIN_IDS.includes(Number(user.telegram_id));
        if (!isAdmin) {
            return res.status(403).json({ error: "Only Admins can refund trades now (Safety Measure)." });
        }

        // Refund on-chain if trade has on_chain_trade_id
        let refundTxHash: string | null = null;
        if (trade.on_chain_trade_id) {
            try {
                // Ensure on_chain_trade_id is passed as string or number correctly
                const onChainId = typeof trade.on_chain_trade_id === 'string' ? trade.on_chain_trade_id : trade.on_chain_trade_id.toString();
                refundTxHash = await escrow.refund(onChainId as any, trade.chain as any);
            } catch (escrowErr: any) {
                console.error("[MINIAPP] Escrow refund failed:", escrowErr);
                return res.status(500).json({ error: "Failed to refund on-chain: " + escrowErr.message });
            }
        }

        await db.updateTrade(req.params.id as string, {
            status: "cancelled",
            completed_at: new Date().toISOString() as any,
            release_tx_hash: refundTxHash as any,
        });

        res.json({ success: true, refund_tx_hash: refundTxHash });

        // NOTIFY PARTIES
        await notifyTradeUpdate(trade.seller_id,
            `🔙 <b>Refund Processed!</b>\n\nYour <b>${trade.amount} ${trade.token}</b> has been returned to your Vault.`
        );
        await notifyTradeUpdate(trade.buyer_id,
            `❌ <b>Trade Cancelled!</b>\n\nThe trade for <b>${trade.amount} ${trade.token}</b> has been cancelled/refunded.`
        );

    } catch (err: any) {
        console.error("[MINIAPP] Refund error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN — Disputes
// ═══════════════════════════════════════════════════════════════

router.get("/admin/disputes", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const isAdmin = env.ADMIN_IDS.includes(Number(user.telegram_id));
        if (!isAdmin) return res.status(403).json({ error: "Admin only" });

        // Use db.listTrades approach — query disputed trades
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
        const { data: disputes } = await supabase
            .from("trades")
            .select("*, seller:users!trades_seller_id_fkey(username, upi_id), buyer:users!trades_buyer_id_fkey(username)")
            .eq("status", "disputed")
            .order("created_at", { ascending: false });

        res.json({ disputes: disputes || [] });
    } catch (err: any) {
        console.error("[ADMIN] Get disputes error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/admin/trades/:id/resolve", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const isAdmin = env.ADMIN_IDS.includes(Number(user.telegram_id));
        if (!isAdmin) return res.status(403).json({ error: "Admin only" });



        const trade = await db.getTradeById(req.params.id as string);
        if (!trade) return res.status(404).json({ error: "Trade not found" });

        const { release_to_buyer, releaseToBuyer } = req.body;
        const shouldReleaseToBuyer = release_to_buyer || releaseToBuyer;

        if (shouldReleaseToBuyer) {
            // Release escrow to buyer
            let txHash: string | null = null;
            if (trade.on_chain_trade_id) {
                txHash = await escrow.release(trade.on_chain_trade_id, trade.chain as any);
            }
            await db.updateTrade(trade.id, { status: "completed" } as any);
            await notifyTradeUpdate(trade.buyer_id,
                `✅ <b>Dispute Resolved!</b>\n\nAdmin has released <b>${trade.amount} ${trade.token}</b> to you.`
            );
            await notifyTradeUpdate(trade.seller_id,
                `⚠️ <b>Dispute Resolved!</b>\n\nAdmin has released <b>${trade.amount} ${trade.token}</b> to the buyer.`
            );
            res.json({ success: true, txHash });
        } else {
            // Refund to seller
            let txHash: string | null = null;
            if (trade.on_chain_trade_id) {
                txHash = await escrow.refund(trade.on_chain_trade_id, trade.chain as any);
            }
            await db.updateTrade(trade.id, { status: "refunded" } as any);
            await notifyTradeUpdate(trade.seller_id,
                `🔙 <b>Dispute Resolved!</b>\n\nAdmin has refunded <b>${trade.amount} ${trade.token}</b> to your vault.`
            );
            await notifyTradeUpdate(trade.buyer_id,
                `❌ <b>Dispute Resolved!</b>\n\nAdmin has refunded the trade to the seller.`
            );
            res.json({ success: true, txHash });
        }
    } catch (err: any) {
        console.error("[ADMIN] Resolve dispute error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN — Send Message in Trade Chat (Dispute Live Chat)
// ═══════════════════════════════════════════════════════════════

router.post("/admin/trades/:id/message", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const isAdmin = env.ADMIN_IDS.includes(Number(user.telegram_id));
        if (!isAdmin) return res.status(403).json({ error: "Admin only" });

        const trade = await db.getTradeById(req.params.id as string);
        if (!trade) return res.status(404).json({ error: "Trade not found" });

        const { message } = req.body;
        if (!message) return res.status(400).json({ error: "Message content required" });

        const newMessage = await db.createTradeMessage({
            trade_id: trade.id,
            user_id: user.id,
            message
        });

        res.json({ success: true, message: newMessage });

        // Notify both parties
        const adminName = user.username || user.first_name || 'Admin';
        await notifyTradeUpdate(trade.buyer_id,
            `🛡️ <b>Admin ${adminName}</b> sent a message in trade chat.\n\n"${message}"`
        );
        await notifyTradeUpdate(trade.seller_id,
            `🛡️ <b>Admin ${adminName}</b> sent a message in trade chat.\n\n"${message}"`
        );
    } catch (err: any) {
        console.error("[ADMIN] Send message error:", err);
        res.status(500).json({ error: err.message });
    }
});



router.get("/admin/trades/:id/messages", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const isAdmin = env.ADMIN_IDS.includes(Number(user.telegram_id));
        if (!isAdmin) return res.status(403).json({ error: "Admin only" });

        const messages = await db.getTradeMessages(req.params.id as string);
        res.json({ messages });
    } catch (err: any) {
        console.error("[ADMIN] Get messages error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  CHAT — Trade Messages
// ═══════════════════════════════════════════════════════════════

router.get("/trades/:id/messages", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const trade = await db.getTradeById(req.params.id as string);
        if (!trade) return res.status(404).json({ error: "Trade not found" });

        const isTradeAdmin = env.ADMIN_IDS.includes(Number(user.telegram_id));
        if (trade.buyer_id !== user.id && trade.seller_id !== user.id && !isTradeAdmin) {
            return res.status(403).json({ error: "Not a party to this trade" });
        }

        const messages = await db.getTradeMessages(trade.id);
        res.json({ messages });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/trades/:id/messages", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const trade = await db.getTradeById(req.params.id as string);
        if (!trade) return res.status(404).json({ error: "Trade not found" });

        const isChatAdmin = env.ADMIN_IDS.includes(Number(user.telegram_id));
        if (trade.buyer_id !== user.id && trade.seller_id !== user.id && !isChatAdmin) {
            return res.status(403).json({ error: "Not a party to this trade" });
        }

        const { message } = req.body;
        if (!message) return res.status(400).json({ error: "Message content required" });

        const newMessage = await db.createTradeMessage({
            trade_id: trade.id,
            user_id: user.id,
            message
        });

        res.json({ success: true, message: newMessage });

        // Notify other party
        const otherPartyId = trade.buyer_id === user.id ? trade.seller_id : trade.buyer_id;
        await notifyTradeUpdate(otherPartyId,
            `💬 <b>New message from ${user.username || user.first_name || 'Partner'}</b>\n\n"${message}"`
        );
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  TRADE MESSAGES — Image Upload
// ═══════════════════════════════════════════════════════════════

router.post("/trades/:id/messages/upload", upload.single("image"), async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const trade = await db.getTradeById(req.params.id as string);
        if (!trade) return res.status(404).json({ error: "Trade not found" });

        const isUploadAdmin = env.ADMIN_IDS.includes(Number(user.telegram_id));
        if (trade.buyer_id !== user.id && trade.seller_id !== user.id && !isUploadAdmin) {
            return res.status(403).json({ error: "Not a party to this trade" });
        }

        if (!req.file) return res.status(400).json({ error: "No image file provided" });

        // Upload to Supabase Storage
        const ext = req.file.originalname.split(".").pop() || "jpg";
        const fileName = `${trade.id}/${Date.now()}_${user.id}.${ext}`;

        const { error: uploadError } = await supabaseStorage.storage
            .from("trade-proofs")
            .upload(fileName, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false,
            });

        if (uploadError) {
            console.error("[Storage] Upload error:", uploadError);
            return res.status(500).json({ error: "Failed to upload image" });
        }

        // Get public URL
        const { data: urlData } = supabaseStorage.storage
            .from("trade-proofs")
            .getPublicUrl(fileName);

        const imageUrl = urlData.publicUrl;

        // Save message with type=image
        const newMessage = await db.createTradeMessage({
            trade_id: trade.id,
            user_id: user.id,
            message: req.body?.caption || "📸 Payment proof",
            type: "image",
            image_url: imageUrl,
        });

        res.json({ success: true, message: newMessage });

        // Notify other party
        const otherPartyId = trade.buyer_id === user.id ? trade.seller_id : trade.buyer_id;
        await notifyTradeUpdate(otherPartyId,
            `📸 <b>${user.username || user.first_name || 'Partner'} sent a payment proof</b>\n\nCheck trade chat for the screenshot.`
        );
    } catch (err: any) {
        console.error("[Upload] Error:", err);
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
        res.json({
            user: {
                ...user,
                is_admin: env.ADMIN_IDS.includes(Number(user.telegram_id))
            }
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.put("/profile", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const { upi_id, phone_number, bank_account_number, bank_ifsc, bank_name, receive_address, cdm_bank_number, cdm_bank_name, cdm_phone, cdm_user_name } = req.body;
        const updates: Record<string, any> = {};
        if (upi_id !== undefined) updates.upi_id = upi_id;
        if (phone_number !== undefined) updates.phone_number = phone_number;
        if (bank_account_number !== undefined) updates.bank_account_number = bank_account_number;
        if (bank_ifsc !== undefined) updates.bank_ifsc = bank_ifsc;
        if (bank_name !== undefined) updates.bank_name = bank_name;
        if (receive_address !== undefined) updates.receive_address = receive_address;
        if (cdm_bank_number !== undefined) updates.cdm_bank_number = cdm_bank_number;
        if (cdm_bank_name !== undefined) updates.cdm_bank_name = cdm_bank_name;
        if (cdm_phone !== undefined) updates.cdm_phone = cdm_phone;
        if (cdm_user_name !== undefined) updates.cdm_user_name = cdm_user_name;

        if (Object.keys(updates).length > 0) {
            await db.updateUser(user.id, updates as any);
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
            total_volume_usdc: stats.total_volume_generic || 0,
            total_fees_amount: stats.total_fees_amount || 0,
            active_orders: stats.active_orders,
            fee_percentage: env.FEE_PERCENTAGE,
            fee_bps: parseInt(env.FEE_BPS),
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//              USER AVATAR UPLOAD (Manual)
// ═══════════════════════════════════════════════════════════════

router.post("/profile/avatar", upload.single('avatar'), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image file provided" });
        }

        // Check file type
        if (!req.file.mimetype.startsWith('image/')) {
            return res.status(400).json({ error: "Only image files are allowed" });
        }

        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        // optimize/resize image if needed? For now just upload.
        // File path: avatars/{user_id}/{timestamp}.ext
        const fileExt = req.file.mimetype.split('/')[1] || 'jpg';
        const filePath = `avatars/${user.id}/${Date.now()}.${fileExt}`;

        // Upload to Supabase Storage
        const { data, error } = await supabaseStorage
            .storage
            .from('avatars')
            .upload(filePath, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: true
            });

        if (error) {
            console.error("Supabase storage upload error:", error);
            throw new Error("Failed to upload image to storage");
        }

        // Get Public URL
        const { data: publicData } = supabaseStorage
            .storage
            .from('avatars')
            .getPublicUrl(filePath);

        const photoUrl = publicData.publicUrl;

        // Update User Profile in DB
        await (db as any).getClient()
            .from("users")
            .update({ photo_url: photoUrl, updated_at: new Date().toISOString() })
            .eq("id", user.id);

        res.json({ success: true, photo_url: photoUrl });

    } catch (err: any) {
        console.error("[Profile] Avatar upload error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  LEADERBOARD
// ═══════════════════════════════════════════════════════════════

router.get("/leaderboard", async (req: Request, res: Response) => {
    try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY);

        const PAGE_SIZE = 50;
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        // Get total count
        const { count: totalCount } = await supabase
            .from("users")
            .select("id", { count: "exact", head: true });

        const { data: users, error } = await supabase
            .from("users")
            .select("id, username, first_name, photo_url, wallet_address, points, total_volume, trade_count, telegram_id")
            .order("points", { ascending: false })
            .range(from, to);

        if (error) throw error;

        // Mask addresses for privacy if no username
        // "Name": Show Username if available, else 0x12...34
        const leaderboard = (users || []).map((u: any, index: number) => ({
            rank: from + index + 1,
            id: u.id,
            name: u.username || (u.first_name ? u.first_name : (u.wallet_address ? `${u.wallet_address.slice(0, 6)}...${u.wallet_address.slice(-4)}` : "Anon")),
            photo_url: u.photo_url,
            points: u.points || 0,
            volume: u.total_volume || 0,
            trades: u.trade_count || 0,
            is_me: req.telegramUser?.id === u.telegram_id
        }));

        res.json({
            leaderboard,
            page,
            total_count: totalCount || 0,
            has_more: (totalCount || 0) > page * PAGE_SIZE,
        });
    } catch (err: any) {
        console.error("[MINIAPP] Leaderboard error:", err);
        res.status(500).json({ error: err.message });
    }
});

export { router as miniappRouter };
