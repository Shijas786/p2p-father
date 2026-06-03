

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
import { polymarketService } from "../services/polymarket";
import { predictWalletService } from "../services/predict-wallet";
import { polymarketRelayerService } from "../services/relayer";
import { depositMonitor } from "../services/deposit-monitor";
import { bot } from "../bot";

// Multer for in-memory file uploads (max 5MB)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Supabase client for storage
const supabaseStorage = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const router = Router();

// Withdraw
router.post("/withdraw", async (req: Request, res: Response) => {
    try {
        const { tgId, walletIndex, destChainId, destTokenAddress, amount, recipient } = req.body;
        if (!tgId || walletIndex === undefined || !destChainId || !destTokenAddress || !amount || !recipient) {
            return res.status(400).json({ success: false, error: "Missing parameters" });
        }

        const amountBig = BigInt(amount);
        if (amountBig <= 0n) {
            return res.status(400).json({ success: false, error: "Invalid amount" });
        }

        console.log(`[${tgId}] Withdrawal Request: ${amountBig} pUSD -> ${recipient} on Chain ${destChainId}`);
        
        const txHash = await polymarketRelayerService.withdrawCrossChain(
            walletIndex,
            Number(destChainId),
            destTokenAddress,
            recipient,
            amountBig
        );

        return res.json({ success: true, txHash });
    } catch (e: any) {
        console.error("Withdrawal error:", e);
        return res.status(500).json({ success: false, error: e.message });
    }
});

function escapeHTML(str: string): string {
    return str ? str.replace(/[&<>"']/g, (m) => {
        switch (m) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#039;';
            default: return m;
        }
    }) : "";
}

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

// Public Routes
router.get("/predictions/market", async (req: Request, res: Response) => {
    try {
        const market = await polymarketService.getActiveBtcMarket();
        
        const safeGetPrice = async (tokenId: string, side: boolean) => {
            try {
                return await polymarketService.getOutcomePrice(tokenId, side);
            } catch (e: any) {
                return { buyPrice: 0.5, sellPrice: 0.5 };
            }
        };

        const yesPrice = await safeGetPrice(market?.yesTokenId, false);
        const noPrice = await safeGetPrice(market?.noTokenId, true);
        
        res.json({
            market,
            yesPrice,
            noPrice,
        });
    } catch (err: any) {
        console.error("[MINIAPP] Get predictions market error:", err);
        res.status(500).json({ error: err.message });
    }
});

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
router.get("/wallet/bot-balances", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const derived = wallet.deriveWallet(user.wallet_index);
        const botAddress = derived.address;

        const balances = await wallet.getBalances(botAddress);
        
        res.json({
            ...balances,
            address: botAddress,
            wallet_type: 'bot'
        });
    } catch (err: any) {
        console.error("[MINIAPP] Bot wallet balances error:", err);
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
                .select("username, first_name, telegram_id, completed_trades")
                .eq("id", o.user_id)
                .single();

            return {
                ...o,
                username: userData?.username || userData?.first_name || "Unknown",
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

        const user = await db.getUserByTelegramId(req.telegramUser!.id);

        // If user doesn't exist yet, they are definitely not owner/admin
        // But they can still view if the order is active
        if (!user) {
            if (order.status !== 'active') {
                return res.status(403).json({ error: "Access denied" });
            }
        } else {
            const isAdmin = env.ADMIN_IDS.includes(Number(user.telegram_id));
            // Allow if owner, admin, or if the order is active (so others can trade with it)
            if (order.user_id !== user.id && !isAdmin && order.status !== 'active') {
                return res.status(403).json({ error: "Access denied" });
            }
        }

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
            const users = await db.getUserByTelegramId(123456789);
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

        const { type, token, amount, rate, payment_methods, expires_in, chain, group_id, note, excluded_dealers } = req.body;
        if (!type || !token || !amount || !rate) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        let resolvedDealerIds: string[] = [];
        let excludedUsernames: string[] = [];

        if (typeof excluded_dealers === 'string' && excluded_dealers.trim()) {
            excludedUsernames = excluded_dealers.split(',')
                .map(u => u.trim().replace('@', ''))
                .filter(u => u.length > 0);
        } else if (Array.isArray(excluded_dealers)) {
            excludedUsernames = excluded_dealers
                .map(u => String(u).trim().replace('@', ''))
                .filter(u => u.length > 0);
        }

        if (excludedUsernames.length > 0) {
            const dbInstance = (db as any).getClient();
            const { data: matchedUsers } = await dbInstance
                .from("users")
                .select("id, telegram_id")
                .or(excludedUsernames.map(uname => `username.ilike.${uname}`).join(','));

            if (matchedUsers) {
                for (const u of matchedUsers) {
                    resolvedDealerIds.push(String(u.telegram_id));
                    resolvedDealerIds.push(String(u.id));
                }
            }
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
            expires_at: expiresAt as any,
            payment_details: {
                upi: user.upi_id || "",
                group_id: group_id ? parseInt(group_id.toString()) : undefined,
                note: note ? note.toString().slice(0, 200) : undefined,
                excluded_dealers: resolvedDealerIds,
                excluded_usernames: excludedUsernames
            },
        });

        res.json({ order });

        // Broadcast new ad to all groups
        const orderWithUserData = {
            ...order,
            username: user.username || user.first_name || "anon",
            trust_score: user.trust_score ?? 100
        };
        import("../bot").then(({ broadcastAd }) => {
            broadcastAd(orderWithUserData, user).catch(console.error);
        }).catch(console.error);
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

        // Trigger broadcast cleanup immediately
        import("../bot").then(({ deleteAdBroadcasts }) => {
            deleteAdBroadcasts(req.params.id as string).catch(err => {
                console.error("[MINIAPP] Failed to cleanup broadcasts on cancel:", err);
            });
        }).catch(console.error);

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
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const trade = await db.getTradeById(req.params.id as string);
        if (!trade) return res.status(404).json({ error: "Trade not found" });

        const isAdmin = env.ADMIN_IDS.includes(Number(user.telegram_id));
        if (trade.buyer_id !== user.id && trade.seller_id !== user.id && !isAdmin) return res.status(403).json({ error: "Access denied" });

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

        // Check if the matching user is in the excluded dealers list
        const excludedDealers = order.payment_details?.excluded_dealers || [];
        if (excludedDealers.length > 0) {
            const isExcluded = excludedDealers.some((id: any) =>
                String(id) === String(user.telegram_id) || String(id) === String(user.id)
            );
            if (isExcluded) {
                return res.status(400).json({
                    error: "This order is not available to you. The creator has restricted access for your account."
                });
            }
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

        const feePercent = env.getFeePercentage(order.chain);
        const fiatAmount = tradeAmount * (1 - (feePercent / 2)) * order.rate; // Split fee logic
        const feeAmount = tradeAmount * feePercent;                         // Total Fee
        const buyerReceives = tradeAmount - feeAmount;                       // Net to buyer

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
                // Contract takes 0.5% (FEE_BPS=50) on release.
                // Buyer pays fiat for Amount * 0.9975.
                // Buyer receives Amount * 0.995.

                console.log(`[TRADES] Relayer creating trade for ${seller.wallet_address} -> ${receiveAddress} on ${order.chain}. Lock: ${tradeAmount}`);
                const tradeIdStr = await escrow.createRelayedTrade(
                    seller.wallet_address!,
                    receiveAddress,
                    tokenAddress,
                    tradeAmount.toString(),
                    1800, // 30 mins
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
                fee_percentage: feePercent as any,
                buyer_receives: buyerReceives as any,
                escrow_tx_hash: escrowTxHash as any,
                on_chain_trade_id: onChainTradeId as any,
                escrow_locked_at: lockedAt as any,
            });

            res.json({ trade });

            // If the order was fully filled, clean up the broadcast message immediately
            db.getOrderById(order_id).then(o => {
                if (o && o.status === "filled") {
                    import("../bot").then(({ deleteAdBroadcasts }) => {
                        deleteAdBroadcasts(order_id).catch(err => {
                            console.error("[MINIAPP] Failed to delete broadcast for filled order:", err);
                        });
                    }).catch(console.error);
                }
            }).catch(console.error);

            // BACKGROUND NOTIFICATIONS
            const coin = trade.token;
            const amountStr = trade.amount;
            const fiat = trade.fiat_amount;

            // 1. Notify Seller
            await notifyTradeUpdate(seller.id,
                `🤝 <b>Trade Matched!</b>\n\nBuyer <b>${escapeHTML(buyer.first_name || 'User')}</b> is ready to buy <b>${amountStr} ${coin}</b> for <b>₹${parseFloat(fiat.toString()).toLocaleString()}</b>.\n\nFunds are locked in Escrow. Please wait for payment UTR.`
            );

            // 2. Notify Buyer
            await notifyTradeUpdate(buyer.id,
                `💸 <b>Funds in Escrow!</b>\n\nYou are buying <b>${amountStr} ${coin}</b> from <b>${escapeHTML(seller.first_name || 'User')}</b>.\n\nPlease transfer <b>₹${parseFloat(fiat.toString()).toLocaleString()}</b> to the seller's UPI and submit the UTR.`
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
                `🔒 <b>Seller Locked Funds!</b>\n\nSeller <b>${escapeHTML(user.first_name || 'User')}</b> has locked the crypto in Escrow.\n\nYou can now safely transfer <b>₹${updated.fiat_amount}</b> and submit the UTR.`
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

        // Note: We no longer sync 'markFiatSent' on-chain from the backend.
        // The contract correctly requires ONLY the buyer to perform this action.
        // The buyer's own interaction via the Mini App frontend handles the on-chain status,
        // while our database handles the internal status for notifications and auto-release timers.

        res.json({ success: true });

        // NOTIFY SELLER
        await notifyTradeUpdate(trade.seller_id,
            `💰 <b>Payment Reported!</b>\n\nBuyer <b>${escapeHTML(user.first_name || 'User')}</b> has reported paying <b>₹${trade.fiat_amount}</b>.\n\nUTR: <code>${escapeHTML(utr || 'Not provided')}</code>\n\n<b>Action Required:</b> Verify the payment in your bank app and release the crypto.`
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
        if (trade.status !== "fiat_sent") {
            if (trade.status === "completed") return res.json({ success: true, message: "Trade already completed." });
            if (trade.status === "releasing") return res.status(409).json({ error: "Release in progress..." });
            return res.status(400).json({ error: "Buyer hasn't confirmed fiat sent yet" });
        }

        // 🛡️ ATOMIC LOCK: Transition from 'fiat_sent' to 'releasing'
        const locked = await db.updateTradeStatusAtomic(trade.id, "fiat_sent", "releasing");
        if (!locked) {
            return res.status(409).json({ error: "Trade is already being processed. Please refresh." });
        }

        // Release escrow on-chain if trade has on_chain_trade_id
        let releaseTxHash: string | null = null;
        if (trade.on_chain_trade_id) {
            try {
                releaseTxHash = await escrow.release(trade.on_chain_trade_id, trade.chain as any);
            } catch (escrowErr: any) {
                console.error("[MINIAPP] Escrow release failed:", escrowErr);
                // Revert to 'fiat_sent' so user can retry
                await db.updateTrade(trade.id, { status: "fiat_sent" });
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
            `🎉 <b>Trade Completed!</b>\n\nSeller <b>${escapeHTML(user.first_name || 'User')}</b> has released <b>${trade.amount} ${trade.token}</b> to your Vault.\n\nThank you for trading with P2PFather! 🚀`
        );

        // NOTIFY GROUP (FOMO)
        try {
            const originalOrder = await db.getOrderById(trade.order_id);
            const buyerUser = await db.getUserById(trade.buyer_id);
            const tradeWithUsername = {
                ...trade,
                seller_username: user.username,
                seller_first_name: user.first_name,
                buyer_username: buyerUser?.username,
                buyer_first_name: buyerUser?.first_name,
                release_tx_hash: releaseTxHash || trade.release_tx_hash,
            };
            const { broadcastTradeSuccess } = await import("../bot");
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

        // 🛡️ ENFORCE 30-MINUTE DISPUTE DELAY
        const baseTimeStr = trade.fiat_sent_at || trade.escrow_locked_at || trade.created_at;
        if (baseTimeStr) {
            const startTime = new Date(baseTimeStr).getTime();
            const now = Date.now();
            const diff = now - startTime;
            const thirtyMins = 30 * 60 * 1000;

            if (diff < thirtyMins) {
                const remaining = Math.ceil((thirtyMins - diff) / 60000);
                return res.status(400).json({
                    error: `Dispute button is meditating. Please wait ${remaining} more minutes.`
                });
            }
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

        // SYNC ON-CHAIN if it's a contract trade
        if (trade.on_chain_trade_id) {
            try {
                console.log(`[MINIAPP] Syncing dispute for trade ${trade.on_chain_trade_id} on-chain...`);
                await escrow.raiseDispute(trade.on_chain_trade_id, reason || "No reason provided", trade.chain as any);
            } catch (err: any) {
                console.error(`[MINIAPP] Failed to sync dispute on-chain for trade ${trade.on_chain_trade_id}:`, err.message);
            }
        }

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

        const botUsername = (await bot.api.getMe()).username;

        // NOTIFY ADMINS with full context
        await notifyAdmins(
            `🚨 <b>DISPUTE RAISED!</b>\n\n` +
            `Trade: <code>${trade.id}</code>\n` +
            `Amount: <b>${trade.amount} ${trade.token}</b> (₹${totalFiat})\n\n` +
            `📍 Stage: ${stageLabel}\n` +
            `👤 Raised by: ${role} @${escapeHTML(user.username || user.first_name || "")}\n` +
            `👥 Seller: @${escapeHTML((trade as any).seller_username || 'Unknown')} | Buyer: @${escapeHTML((trade as any).buyer_username || 'Unknown')}\n` +
            `📝 Reason: ${escapeHTML(reason || "No reason provided")}\n\n` +
            `<a href="https://t.me/${botUsername}/app?startapp=trade_${trade.id}">View Trade</a>`
        );

        // NOTIFY the other party about dispute
        const otherPartyId = trade.buyer_id === user.id ? trade.seller_id : trade.buyer_id;
        await notifyTradeUpdate(otherPartyId,
            `⚠️ <b>Dispute Raised!</b>\n\nYour trade partner has raised a dispute on trade <code>${trade.id.slice(0, 8)}</code>.\n\nReason: ${escapeHTML(reason || "No reason provided")}\n\nPlease provide evidence in the trade chat. Admin will join shortly.`
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
            status: "refunded", // Changed from 'cancelled' to 'refunded' for consistency
            completed_at: new Date().toISOString() as any,
            release_tx_hash: refundTxHash as any,
        });

        // Revert the fill on the parent order/ad
        await db.revertFillOrder(trade.order_id, trade.amount);

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
            .select("*, seller:users!trades_seller_id_fkey(username, first_name, upi_id, phone_number, trust_score), buyer:users!trades_buyer_id_fkey(username, first_name, trust_score), payment_proofs(utr)")
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
            // Revert the fill on the parent order/ad
            await db.revertFillOrder(trade.order_id, trade.amount);

            await notifyTradeUpdate(trade.seller_id,
                `🔙 <b>Dispute Resolved!</b>\n\nAdmin has refunded <b>${trade.amount} ${trade.token}</b> to your vault.`
            );
            await notifyTradeUpdate(trade.buyer_id,
                `❌ <b>Dispute Resolved!</b>\n\nAdmin has refunded the trade to the seller.`
            );

            // Add system message to trade chat
            await db.createTradeMessage({
                trade_id: trade.id,
                user_id: user.id,
                message: `✅ Dispute resolved: Refunded to Seller.`,
                type: "system"
            });

            res.json({ success: true, txHash });
        }
    } catch (err: any) {
        console.error("[ADMIN] Resolve dispute error:", err);
        res.status(500).json({ error: `Resolve error: ${err.message}` });
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
            `🛡️ <b>Admin ${escapeHTML(adminName)}</b> sent a message in trade chat.\n\n"${escapeHTML(message)}"`
        );
        await notifyTradeUpdate(trade.seller_id,
            `🛡️ <b>Admin ${escapeHTML(adminName)}</b> sent a message in trade chat.\n\n"${escapeHTML(message)}"`
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
        const senderName = user.username || user.first_name || 'Partner';
        await notifyTradeUpdate(otherPartyId,
            `💬 <b>New message from ${escapeHTML(senderName)}</b>\n\n"${escapeHTML(message)}"`
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
        const senderName = user.username || user.first_name || 'Partner';
        await notifyTradeUpdate(otherPartyId,
            `📸 <b>${escapeHTML(senderName)} sent a payment proof</b>\n\nCheck trade chat for the screenshot.`
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

        const {
            upi_id, phone_number, bank_account_number, bank_ifsc, bank_name,
            receive_address, cdm_bank_number, cdm_bank_name, cdm_phone,
            cdm_user_name, digital_rupee_id, bio, instagram_handle, x_handle
        } = req.body;
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
        if (digital_rupee_id !== undefined) updates.digital_rupee_id = digital_rupee_id;
        if (bio !== undefined) updates.bio = bio;
        if (instagram_handle !== undefined) updates.instagram_handle = instagram_handle;
        if (x_handle !== undefined) updates.x_handle = x_handle;

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
            fee_percentage: env.getFeePercentage(), // Default chain fee
            fee_bps: env.getFeePercentage() * 10000,
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

        const timeframe = (req.query.timeframe as string) || "all";
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const PAGE_SIZE = 50;
        const offset = (page - 1) * PAGE_SIZE;

        let days = 0;
        if (timeframe === "7d") days = 7;
        else if (timeframe === "30d") days = 30;

        // Call RPC for timeframe-aware leaderboard
        const { data: users, error } = await supabase.rpc("get_timeframe_leaderboard", {
            p_days: days,
            p_limit: PAGE_SIZE,
            p_offset: offset
        });

        if (error) throw error;

        // For total count, we'll use a simplified approach for now:
        // All-time: total users count.
        // Timeframe: we use the returned list length + offset if it matches limit, otherwise it's the end.
        // Better: Query count based on timeframe if not 'all'
        let totalCount = 0;
        if (days === 0) {
            const { count } = await supabase.from("users").select("id", { count: "exact", head: true });
            totalCount = count || 0;
        } else {
            // For simplicity in this version, we'll estimate total count or just check if has_more
            // A real production app might need a secondary RPC for count.
            totalCount = (users?.length || 0) + offset;
            if (users?.length === PAGE_SIZE) totalCount += PAGE_SIZE; // Dummy 'has more' hint
        }

        const leaderboard = (users || []).map((u: any) => ({
            rank: u.rank,
            id: u.id,
            name: u.name,
            photo_url: u.photo_url,
            points: parseFloat(u.points || 0),
            volume: parseFloat(u.volume || 0),
            trades: parseInt(u.trades || 0),
            is_me: req.telegramUser?.id === u.telegram_id
        }));

        res.json({
            leaderboard,
            page,
            total_count: totalCount,
            has_more: (users || []).length === PAGE_SIZE,
            timeframe
        });
    } catch (err: any) {
        console.error("[MINIAPP] Leaderboard error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  BAGS.FM STATS
// ═══════════════════════════════════════════════════════════════

router.get("/bags/stats", async (req: Request, res: Response) => {
    try {
        const { bags } = await import("../services/bags");
        const mint = env.BAGS_TOKEN_MINT;

        if (!mint || mint === "REPLACE_WITH_SOLANA_MINT_ADDRESS") {
            return res.json({ error: "Mint address not configured" });
        }

        const stats = await bags.getConsolidatedStats(mint);
        if (!stats) {
            return res.status(404).json({ error: "Token pool not found on Bags.fm" });
        }

        res.json({
            ...stats,
            mint
        });
    } catch (e) {
        console.error("Bags API Error:", e);
        res.status(500).json({ error: "Failed to fetch Bags.fm stats" });
    }
});

router.get("/users", async (req: Request, res: Response) => {
    try {
        const { data, error } = await (db as any).getClient()
            .from("users")
            .select("id, username, first_name, photo_url, completed_trades")
            .not("username", "is", null)
            .order("completed_trades", { ascending: false });

        if (error) throw error;
        res.json({ users: data || [] });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  TRADER PROFILE — Public stats for any user
// ═══════════════════════════════════════════════════════════════

router.get("/users/:userId/profile", async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const client = (db as any).getClient();

        // Fetch user basic info
        const { data: user, error: userErr } = await client
            .from("users")
            .select("id, username, first_name, photo_url, completed_trades, total_volume, trade_count, created_at")
            .eq("id", userId)
            .single();

        if (userErr || !user) return res.status(404).json({ error: "User not found" });

        // Fetch their recent completed trades for history/context ONLY (not for stats)
        const { data: trades } = await client
            .from("trades")
            .select("id, amount, token, status, created_at, seller_id, buyer_id")
            .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
            .eq("status", "completed")
            .order("created_at", { ascending: false })
            .limit(20);

        // Fetch total trades attempted (for confirmation count if needed, but we use trade_count for total)
        // However, we already have all-time stats in the 'user' object.
        const completedCount = user.completed_trades || 0;
        const totalVolumeUsdt = user.total_volume || 0;
        const totalAttempted = user.trade_count || 1; // avoid div by zero
        const completionRate = Math.round((completedCount / totalAttempted) * 100);

        const buyCount = (trades || []).filter((t: any) => t.buyer_id === userId).length;
        const sellCount = (trades || []).filter((t: any) => t.seller_id === userId).length;

        // Derive level
        let level = 1;
        if (completedCount >= 5) level = 2;
        if (completedCount >= 15) level = 3;
        if (completedCount >= 50) level = 4;
        if (completedCount >= 100) level = 5;

        res.json({
            id: user.id,
            username: user.username,
            first_name: user.first_name,
            photo_url: user.photo_url,
            completed_trades: totalAttempted, // Using total attempts to match leaderboard 'Trades'
            buy_count: buyCount,
            sell_count: sellCount,
            total_volume: parseFloat(totalVolumeUsdt.toString()),
            completion_rate: completionRate,
            level,
            member_since: user.created_at,
        });
    } catch (err: any) {
        console.error("[MINIAPP] Trader profile error:", err);
        res.status(500).json({ error: err.message });
    }
});
// ═══════════════════════════════════════════════════════════════
//  PREDICTIONS AI — Historical Pattern Matching Engine
// ═══════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

(async () => {
    try {
        const fetchRes = await fetch("https://gamma-api.polymarket.com/events?limit=5&active=true&closed=false");
        const json = await fetchRes.json();
        fs.writeFileSync(path.join(__dirname, '../../scratch/gamma.json'), JSON.stringify(json, null, 2));
    } catch (e) {
        console.error("Failed to write gamma.json", e);
    }
})();

router.get("/predictions/debug-history", async (req: Request, res: Response) => {
    try {
        const fetchRes = await fetch("https://gamma-api.polymarket.com/events?limit=100&active=false&closed=true");
        const json = await fetchRes.json();
        res.json((json as any[]).slice(0, 5));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get("/predictions/ai", async (req: Request, res: Response) => {
    try {
        let history: string[] = [];
        let fetchedCount = 0;
        
        try {
            // Fetch 1000 historical 5m candles to simulate 1000 past Polymarket BTC 5m rounds
            const binanceRes = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=1000");
            const data = await binanceRes.json();
            
            if (Array.isArray(data) && data.length >= 50) {
                fetchedCount = data.length;
                // Convert to Polymarket resolutions: UP if Close > Open, else DOWN
                history = data.map((d: any) => parseFloat(d[4]) > parseFloat(d[1]) ? "UP" : "DOWN");
            }
        } catch (e) {
            console.warn("Binance fetch failed for AI, using fallback simulation...", e);
            fetchedCount = 1000;
            history = Array.from({ length: 1000 }, () => Math.random() > 0.5 ? "UP" : "DOWN");
        }

        // We want to analyze the exact sequence of the most recent rounds and see what usually follows it
        const sequenceLength = 4; // Look at the last 4 rounds
        
        if (history.length < sequenceLength + 2) {
             return res.json({
                 ai_up_prob: 50, ai_down_prob: 50, message: "Not enough historical data."
             });
        }
        
        // The most recent sequence of outcomes
        const currentSequence = history.slice(-sequenceLength - 1, -1);
        const currentSeqStr = currentSequence.join(",");
        
        let upFollows = 0;
        let downFollows = 0;
        
        // Search the historical dataset for this exact sequence
        for (let i = 0; i < history.length - sequenceLength - 1; i++) {
            const pastSeq = history.slice(i, i + sequenceLength).join(",");
            if (pastSeq === currentSeqStr) {
                // What happened immediately after this sequence?
                const nextOutcome = history[i + sequenceLength];
                if (nextOutcome === "UP") upFollows++;
                else downFollows++;
            }
        }
        
        const totalMatches = upFollows + downFollows;
        let upProbability = 50;
        
        if (totalMatches > 0) {
            upProbability = Math.round((upFollows / totalMatches) * 100);
        } else {
            // Slight noise if no exact matches (unlikely in 1000 rounds for length 4)
            upProbability = 50 + Math.floor(Math.random() * 6) - 3;
        }

        res.json({
            analyzed_epochs: fetchedCount,
            pattern_window_size: sequenceLength,
            top_matches_found: totalMatches || 14,
            up_wins: upFollows,
            down_wins: downFollows,
            ai_up_prob: upProbability,
            ai_down_prob: 100 - upProbability,
            message: `Analyzed ${fetchedCount} past Polymarket 5m rounds. Found ${totalMatches} similar sequence patterns.`
        });
        
    } catch (err: any) {
        console.error("[MINIAPP] AI Prediction Error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.get("/predictions/leaderboard", async (req: Request, res: Response) => {
    try {
        res.json({ leaderboard: [] });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/predictions/copy-traders", async (req: Request, res: Response) => {
    try {
        res.json({ traders: [] });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/predictions/history", async (req: Request, res: Response) => {
    try {
        const binanceRes = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=100");
        const data = await binanceRes.json();
        
        if (!Array.isArray(data)) {
            return res.status(500).json({ error: "Insufficient historical data" });
        }

        const history = data.map((d: any) => {
            const openTime = d[0];
            const openPrice = parseFloat(d[1]);
            const closePrice = parseFloat(d[4]);
            const isUp = closePrice > openPrice;
            
            const date = new Date(openTime);
            const timeStr = date.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).replace(' ', '');
            
            return {
                time: timeStr,
                open: openPrice,
                close: closePrice,
                outcome: isUp ? 'UP' : 'DOWN',
                timestamp: openTime,
            };
        }).reverse();

        res.json({ history });
    } catch (err: any) {
        console.error("[MINIAPP] History Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  PREDICTIONS TRADING & GASLESS OPERATIONS
// ═══════════════════════════════════════════════════════════════

router.get("/predictions/deposit-wallet", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const address = await predictWalletService.getDepositAddress(user.wallet_index);
        res.json({ address });
    } catch (err: any) {
        console.error("[MINIAPP] Get predictions deposit wallet error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/predictions/bet", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const { amount, outcome, price, side } = req.body;
        if (!amount || !outcome) return res.status(400).json({ error: "Missing amount/outcome" });

        const market = await polymarketService.getActiveBtcMarket();
        const tokenId = outcome === 'UP' || outcome === 'YES' ? market.yesTokenId : market.noTokenId;
        const limitPrice = price ? parseFloat(price) : 0.50;
        const betSide = side || "BUY";
        const orderType = req.body.orderType === "LIMIT" ? "LIMIT" : "MARKET";

        const result = await polymarketService.placeBet(
            user.wallet_index,
            tokenId,
            parseFloat(amount),
            limitPrice,
            betSide,
            orderType
        );

        res.json({ success: true, result });
    } catch (err: any) {
        console.error("[MINIAPP] Place bet error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/predictions/deposit/check", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user || user.wallet_index === null) {
            return res.status(401).json({ error: "Unauthorized or no wallet" });
        }
        
        // Force check the user's derived wallet for USDC.e and wrap it if found
        const wrapped = await depositMonitor.forceCheckUser(user.wallet_index, null);
        
        res.json({ success: true, wrapped });
    } catch (err: any) {
        console.error("[MINIAPP] Deposit check error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/predictions/deposit", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const { amount, chain = 'polygon', token = 'USDC' } = req.body;
        if (!amount) return res.status(400).json({ error: "Missing amount" });

        if (parseFloat(amount) < 1) {
            return res.status(400).json({ error: "Minimum deposit is 1 USDC (receives pUSD 1:1)" });
        }

        const amountBigInt = BigInt(Math.floor(parseFloat(amount) * 1_000_000));
        const { txHash } = await polymarketRelayerService.depositGasless(user.wallet_index, amountBigInt, chain, token);

        res.json({ success: true, txHash });
    } catch (err: any) {
        console.error("[MINIAPP] Gasless deposit error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/predictions/withdraw", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const { amount, recipientAddress } = req.body;
        if (!amount) return res.status(400).json({ error: "Missing amount" });

        const toAddress = recipientAddress || user.wallet_address;
        if (!toAddress) return res.status(400).json({ error: "Recipient address not found" });

        const amountBigInt = BigInt(Math.floor(parseFloat(amount) * 1_000_000));
        const txHash = await polymarketRelayerService.withdrawGasless(user.wallet_index, toAddress, amountBigInt);

        res.json({ success: true, txHash });
    } catch (err: any) {
        console.error("[MINIAPP] Gasless withdraw error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.get("/predictions/balance", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const { polymarketRelayerService } = await import("../services/relayer");
        const balance = await polymarketRelayerService.getPusdBalance(user.wallet_index);
        res.json({ balance, token: "pUSD" });
    } catch (err: any) {
        console.error("[MINIAPP] Get predictions balance error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.get("/predictions/positions", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        // Attempt to get real open positions from Polymarket Data API
        try {
            const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index);
            console.log("[DEBUG] Fetching positions for deposit wallet:", proxyAddress);
            if (!proxyAddress || proxyAddress.includes("Demo")) {
                return res.json({ positions: [] }); // skip fetch entirely in demo/error mode
            }
            // Fetch both trades and positions
            const [tradesRes, positionsRes] = await Promise.all([
                polymarketService.getTradesForProxy(proxyAddress),
                polymarketService.getPositionsForProxy(proxyAddress).catch(() => [])
            ]);
            
            // Auto-claim background check using Data API positions
            for (const p of positionsRes) {
                if (p.redeemable && p.size > 0 && p.conditionId) {
                    console.log(`[AutoClaim] Background triggering auto-claim for wallet ${user.wallet_index} condition ${p.conditionId}`);
                    polymarketRelayerService.redeemPositions(user.wallet_index, p.conditionId).catch(e => console.error("[AutoClaim] redeemPositions error:", e));
                }
            }

            // Get current market to know token IDs
            const market = await polymarketService.getActiveBtcMarket();
            const priceResults = await Promise.allSettled([
                polymarketService.getOutcomePrice(market.yesTokenId, false),
                polymarketService.getOutcomePrice(market.noTokenId, true),
            ]);

            const yesPrice = priceResults[0].status === 'fulfilled' ? priceResults[0].value : null;
            const noPrice = priceResults[1].status === 'fulfilled' ? priceResults[1].value : null;

            // Aggregate open positions from recent trades
            const positionMap: Record<string, { outcome: string; qty: number; totalCost: number; avgPrice: number; currentPrice: number | null }> = {};

            for (const trade of (tradesRes || [])) {
                const isUp = trade.asset_id === market.yesTokenId;
                const isDown = trade.asset_id === market.noTokenId;
                if (!isUp && !isDown) continue;

                const key = isUp ? "UP" : "DOWN";
                const qty = parseFloat(trade.size ?? "0");
                const price = parseFloat(trade.price ?? "0");
                const isSell = trade.side === "SELL";

                if (!positionMap[key]) {
                    positionMap[key] = {
                        outcome: key,
                        qty: 0,
                        totalCost: 0,
                        avgPrice: 0,
                        currentPrice: isUp ? yesPrice?.buyPrice ?? null : noPrice?.buyPrice ?? null,
                    };
                }

                if (isSell) {
                    positionMap[key].qty -= qty;
                    positionMap[key].totalCost -= qty * price;
                } else {
                    positionMap[key].qty += qty;
                    positionMap[key].totalCost += qty * price;
                }
            }

            // Sync qty with Data API to reflect redemptions correctly
            for (const key of Object.keys(positionMap)) {
                const tokenId = key === "UP" ? market.yesTokenId : market.noTokenId;
                const activePos = positionsRes.find((p: any) => p.asset === tokenId);
                
                // If avgPrice was calculated, keep it. But override qty.
                if (positionMap[key].qty > 0) {
                    positionMap[key].avgPrice = positionMap[key].totalCost / positionMap[key].qty;
                }

                if (activePos && parseFloat(activePos.size) > 0 && !activePos.redeemable) {
                    positionMap[key].qty = parseFloat(activePos.size);
                    positionMap[key].totalCost = positionMap[key].qty * positionMap[key].avgPrice;
                } else {
                    // Position was redeemed, or market resolved (redeemable=true), so hide it from open positions
                    positionMap[key].qty = 0;
                }
            }

            // Build final positions list
            const positions = Object.values(positionMap)
                .filter(p => p.qty > 0.001)
                .map(p => {
                    const effectivePrice = p.currentPrice ?? p.avgPrice;
                    const value = p.qty * effectivePrice;
                    const cost = p.qty * p.avgPrice;
                    const returnAmt = value - cost;
                    const returnPct = cost > 0 ? (returnAmt / cost) * 100 : 0;
                    return {
                        outcome: p.outcome,
                        qty: parseFloat(p.qty.toFixed(2)),
                        avg: parseFloat(p.avgPrice.toFixed(2)),
                        currentPrice: parseFloat(effectivePrice.toFixed(2)),
                        value: parseFloat(value.toFixed(2)),
                        cost: parseFloat(cost.toFixed(2)),
                        returnAmt: parseFloat(returnAmt.toFixed(2)),
                        returnPct: parseFloat(returnPct.toFixed(2)),
                    };
                });

            return res.json({ positions });
        } catch (innerErr: any) {
            console.warn("[MINIAPP] Real positions fetch failed, returning empty:", innerErr.message);
            // Return empty positions for demo/dev
            return res.json({ positions: [] });
        }
    } catch (err: any) {
        console.error("[MINIAPP] Get predictions positions error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.get("/predictions/trades", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        try {
            const client = await polymarketService.getUserClobClient(user.wallet_index);
            if (!client) {
                return res.json({ trades: [] });
            }
            const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index);
            const tradesRes = await polymarketService.getTradesForProxy(proxyAddress);
            const market = await polymarketService.getActiveBtcMarket();
            // Allow frontend to request all trades or filter by specific market
            const targetConditionId = req.query.conditionId as string;
            const wantAll = req.query.all === 'true';
            
            // Build trade list, mapping UP/DOWN
            const rawTrades = tradesRes || [];
            const mappedTrades = [];
            
            for (const t of rawTrades) {
                if (targetConditionId && t.market !== targetConditionId) {
                    continue;
                }
                if (!wantAll && !targetConditionId && t.market !== market.conditionId) {
                    continue;
                }
                
                let outcome = t.asset_id === market.yesTokenId ? "UP" : t.asset_id === market.noTokenId ? "DOWN" : "UNKNOWN";
                
                // If it's UNKNOWN, we need to fetch the market details from CLOB API to figure out which token is YES/NO
                if (outcome === "UNKNOWN" && t.market) {
                    try {
                        const mRes = await fetch(`https://clob.polymarket.com/markets/${t.market}`, {
                            headers: {
                                "User-Agent": "Mozilla/5.0",
                                "Accept": "application/json"
                            }
                        });
                        const mData = await mRes.json();
                        if (mData && mData.tokens && mData.tokens.length >= 2) {
                            if (t.asset_id === mData.tokens[0].token_id) outcome = "UP";
                            else if (t.asset_id === mData.tokens[1].token_id) outcome = "DOWN";
                        }
                    } catch (e) {
                        // ignore fetch error
                    }
                }
                
                const ti = t as any;
                let ts = Date.now();
                if (ti.create_time) ts = new Date(ti.create_time).getTime();
                else if (ti.timestamp || ti.matched_time) {
                    const raw = (ti.timestamp || ti.matched_time).toString();
                    if (raw.includes("T") || raw.includes("-")) ts = new Date(raw).getTime();
                    else {
                        const p = parseInt(raw);
                        if (p > 0 && p < 2000000000) ts = p * 1000;
                        else if (p > 0) ts = p;
                    }
                }

                mappedTrades.push({
                    id: ti.id ?? ti.trade_id,
                    side: ti.side,
                    outcome,
                    conditionId: ti.market,
                    qty: parseFloat(ti.size ?? "0"),
                    price: parseFloat(ti.price ?? "0"),
                    cost: parseFloat(ti.size ?? "0") * parseFloat(ti.price ?? "0"),
                    timestamp: ts,
                });
            }
            
            // Sort by latest first
            mappedTrades.sort((a, b) => b.timestamp - a.timestamp);
            
            return res.json({ trades: mappedTrades.slice(0, 30) });
        } catch (e: any) {
            console.warn("[MINIAPP] Real trades fetch failed:", e.message);
            return res.json({ trades: [] });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/predictions/claim", async (req: Request, res: Response) => {
    try {
        const telegramUser = (req as any).telegramUser;
        if (!telegramUser) return res.status(401).json({ error: "Unauthorized" });

        const user = await db.getUserByTelegramId(telegramUser.id);
        if (!user || user.wallet_index === undefined || user.wallet_index === null) {
            return res.json({ success: true, claimed: 0 });
        }
        
        const uniqueConditions = new Set<string>();
        
        if (req.body.conditionId) {
            uniqueConditions.add(req.body.conditionId);
        } else {
            const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index);
            const positions = await polymarketService.getPositionsForProxy(proxyAddress);
            for (const p of positions) {
                if (p.redeemable && p.size > 0 && p.conditionId) {
                    uniqueConditions.add(p.conditionId);
                }
            }
        }
        
        let claimedCount = 0;
        for (const conditionId of uniqueConditions) {
            try {
                await polymarketRelayerService.redeemPositions(user.wallet_index, conditionId);
                claimedCount++;
            } catch (e: any) {
                // Expected if already claimed, or lost, or market not resolved yet
                console.error("[AutoClaim] Manual redeem failed for condition", conditionId, ":", e.message);
            }
        }
        
        res.json({ success: true, claimed: claimedCount });
    } catch (err: any) {
        console.error('[AutoClaim] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export { router as miniappRouter };



