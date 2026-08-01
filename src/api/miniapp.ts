

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
import { ethers } from "ethers";
import axios from "axios";

import { polymarketRelayerService } from "../services/relayer";
import { depositMonitor } from "../services/deposit-monitor";
import { bridgeMonitor } from "../services/bridge-monitor";
import { attemptedRedeems } from "../services/jobs";
import { bot } from "../bot";
import { redis } from "../services/redis";

// Multer for in-memory file uploads (max 5MB)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Supabase client for storage
const supabaseStorage = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const router = Router();

// System Status & Maintenance Endpoints (Public)
let isMaintenanceActive = process.env.MAINTENANCE_MODE === "true";
let maintenanceMessage = process.env.MAINTENANCE_MESSAGE || "P2PFather is currently undergoing maintenance.";

router.get("/system/status", async (req: Request, res: Response) => {
    res.json({
        maintenance: process.env.MAINTENANCE_MODE === "true" || isMaintenanceActive,
        title: "System Upgrade in Progress",
        message: maintenanceMessage,
        estimatedTime: process.env.MAINTENANCE_ESTIMATED_TIME || "Expected back online shortly",
        timestamp: new Date().toISOString()
    });
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
        console.warn(`[AUTH] ❌ Missing initData`);
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

// ── Orderbook proxy: server-side cache so mobile clients never hit clob.polymarket.com ──
let _obCache: { data: any; ts: number } | null = null;
const OB_CACHE_MS = 2500; // refresh every 2.5s server-side

router.get("/predictions/orderbook", async (req: Request, res: Response) => {
    try {
        const now = Date.now();
        if (_obCache && now - _obCache.ts < OB_CACHE_MS) {
            return res.json(_obCache.data);
        }

        const market = await polymarketService.getActiveBtcMarket();
        if (!market?.yesTokenId || !market?.noTokenId) {
            return res.status(503).json({ error: "No active market" });
        }

        const CLOB_HEADERS = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Origin": "https://polymarket.com",
            "Referer": "https://polymarket.com/"
        };

        const [resY, resN] = await Promise.all([
            fetch(`https://clob.polymarket.com/book?token_id=${market.yesTokenId}`, { headers: CLOB_HEADERS }),
            fetch(`https://clob.polymarket.com/book?token_id=${market.noTokenId}`, { headers: CLOB_HEADERS })
        ]);

        const [bookY, bookN] = await Promise.all([resY.json(), resN.json()]);

        const bestBidY = bookY.bids?.length ? Math.max(...bookY.bids.map((b: any) => parseFloat(b.price))) : null;
        const bestAskY = bookY.asks?.length ? Math.min(...bookY.asks.map((a: any) => parseFloat(a.price))) : null;
        const bestBidN = bookN.bids?.length ? Math.max(...bookN.bids.map((b: any) => parseFloat(b.price))) : null;
        const bestAskN = bookN.asks?.length ? Math.min(...bookN.asks.map((a: any) => parseFloat(a.price))) : null;

        const result = {
            yes: {
                buyPrice:  bestAskY ?? (bestAskN !== null ? 1 - bestAskN : 0.5),
                sellPrice: bestBidY ?? (bestBidN !== null ? 1 - bestBidN : 0.5),
            },
            no: {
                buyPrice:  bestAskN ?? (bestAskY !== null ? 1 - bestAskY : 0.5),
                sellPrice: bestBidN ?? (bestBidY !== null ? 1 - bestBidY : 0.5),
            }
        };

        _obCache = { data: result, ts: now };
        res.json(result);
    } catch (err: any) {
        // Return cached data on error if available
        if (_obCache) return res.json(_obCache.data);
        res.status(500).json({ error: err.message });
    }
});

router.get("/predictions/klines", async (req: Request, res: Response) => {
    try {
        const { symbol, interval, startTime, limit, ui } = req.query;
        const apiPath = ui === 'true' ? 'uiKlines' : 'klines';
        
        let url = `https://api.binance.com/api/v3/${apiPath}?symbol=${symbol || 'BTCUSDT'}&interval=${interval || '5m'}`;
        if (startTime) url += `&startTime=${startTime}`;
        if (limit) url += `&limit=${limit}`;

        const cacheKey = `binance_klines:${crypto.createHash("md5").update(url).digest("hex")}`;
        
        // Try reading from Redis cache
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                return res.json(JSON.parse(cached));
            }
        } catch (redisErr: any) {
            console.warn("[KlinesCache] Redis get error:", redisErr.message);
        }

        const binanceRes = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data = await binanceRes.json();

        // Save to Redis: cache historical data (with startTime) for 1 hour, live data for 3 seconds
        const ttl = startTime ? 3600 : 3;
        try {
            await redis.setex(cacheKey, ttl, JSON.stringify(data));
        } catch (redisErr: any) {
            console.warn("[KlinesCache] Redis set error:", redisErr.message);
        }

        res.json(data);
    } catch (err: any) {
        console.error("[MINIAPP] Binance klines proxy error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

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
//  WITHDRAWAL — Authenticated Cross-Chain Hot Wallet Withdrawal
// ═══════════════════════════════════════════════════════════════

router.post("/withdraw", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ success: false, error: "Unauthorized" });

        const { walletIndex, destChainId, destTokenAddress, amount, recipient } = req.body;
        if (walletIndex === undefined || !destChainId || !destTokenAddress || !amount || !recipient) {
            return res.status(400).json({ success: false, error: "Missing parameters" });
        }

        // Strict Ownership Check: Ensure user only withdraws from their assigned wallet_index
        if (Number(walletIndex) !== Number(user.wallet_index)) {
            return res.status(403).json({ success: false, error: "Forbidden: Wallet index mismatch" });
        }

        const amountBig = BigInt(amount);
        if (amountBig <= 0n) {
            return res.status(400).json({ success: false, error: "Invalid amount" });
        }

        console.log(`[${user.telegram_id}] Withdrawal Request: ${amountBig} pUSD -> ${recipient} on Chain ${destChainId}`);
        
        const txHash = await polymarketRelayerService.withdrawCrossChain(
            user.wallet_index,
            destChainId.toString(),
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

        // Count qualified invites
        const supabaseClient = db.getClient();
        const { count: qualified_invites } = await supabaseClient
            .from("referrals")
            .select("*", { count: "exact", head: true })
            .eq("referrer_telegram_id", tgUser.id)
            .eq("status", "completed");

        res.json({
            user: {
                ...user,
                qualified_invites: qualified_invites || 0,
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

        const [
            balances,
            vaultBaseUsdc, vaultBscUsdc, vaultBaseUsdt, vaultBscUsdt, vaultBscBnb,
            reservedBaseUsdc, reservedBscUsdc, reservedBaseUsdt, reservedBscUsdt, reservedBscBnb
        ] = await Promise.all([
            wallet.getBalances(user.wallet_address),
            escrow.getVaultBalance(user.wallet_address, env.USDC_ADDRESS, 'base').catch(() => "0.0"),
            escrow.getVaultBalance(user.wallet_address, "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", 'bsc').catch(() => "0.0"),
            escrow.getVaultBalance(user.wallet_address, env.USDT_ADDRESS, 'base').catch(() => "0.0"),
            escrow.getVaultBalance(user.wallet_address, "0x55d398326f99059fF775485246999027B3197955", 'bsc').catch(() => "0.0"),
            escrow.getVaultBalance(user.wallet_address, "0x0000000000000000000000000000000000000000", 'bsc').catch(() => "0.0"),
            db.getReservedAmount(user.id, 'USDC', 'base').catch(() => 0),
            db.getReservedAmount(user.id, 'USDC', 'bsc').catch(() => 0),
            db.getReservedAmount(user.id, 'USDT', 'base').catch(() => 0),
            db.getReservedAmount(user.id, 'USDT', 'bsc').catch(() => 0),
            db.getReservedAmount(user.id, 'BNB', 'bsc').catch(() => 0)
        ]);

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

router.post("/wallet/execute", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user?.wallet_address) {
            return res.status(400).json({ error: "No wallet configured" });
        }

        if ((user as any).wallet_type === 'external') {
            return res.status(400).json({ error: "External wallets cannot sign server-side" });
        }

        const { to, data, value, chainId } = req.body;
        if (!to || !data) {
            return res.status(400).json({ error: "Missing to/data" });
        }

        let chain: any = 'base';
        if (chainId === 1) chain = 'mainnet';
        else if (chainId === 56) chain = 'bsc';
        else if (chainId === 137) chain = 'polygon';
        else if (chainId === 42161) chain = 'arbitrum';
        else if (chainId === 10) chain = 'optimism';
        else if (chainId === 43114) chain = 'avalanche';
        else if (chainId === 59144) chain = 'linea';
        else if (chainId === 534352) chain = 'scroll';
        else if (chainId === 8453) chain = 'base';
        
        console.log(`[WALLET EXECUTE] User ${user.id} executing on ${chain} to ${to}`);
        
        const txHash = await wallet.executeRawTransaction(
            user.wallet_index,
            chain,
            to,
            data,
            value
        );

        res.json({ success: true, txHash });
    } catch (err: any) {
        console.error("[MINIAPP] Execute error:", err);
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

        // Normalise to EIP-55 checksum format before saving
        let normalisedAddress: string;
        try {
            normalisedAddress = ethers.getAddress(address);
        } catch {
            return res.status(400).json({ error: "Invalid Ethereum address checksum" });
        }

        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        await db.updateUser(user.id, {
            wallet_address: normalisedAddress,
            wallet_type: 'external',
            receive_address: null, // Clear any custom receive address to avoid cross-wallet payout confusion
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
            receive_address: null, // Clear any custom receive address from previous wallet
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

router.post("/admin/maintenance", validateInitData, async (req: Request, res: Response) => {
    try {
        const user = (req as any).telegramUser;
        const telegramId = Number(user?.id);
        if (!env.ADMIN_IDS.includes(telegramId)) {
            return res.status(403).json({ error: "Admin access required" });
        }
        const { active, message } = req.body;
        if (typeof active === "boolean") {
            isMaintenanceActive = active;
        }
        if (message) {
            maintenanceMessage = message;
        }
        res.json({ ok: true, maintenance: isMaintenanceActive, message: maintenanceMessage });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

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
}

router.post("/orders", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        // Require at least one payment method set up
        if (!user.upi_id && !user.phone_number && !user.bank_account_number && !user.digital_rupee_id && !user.cdm_bank_number) {
            return res.status(400).json({
                error: "Please set up your payment details (UPI ID, Phone Number, or Bank Account) in your Profile before creating an ad."
            });
        }

        const { type, token, amount, rate, payment_methods, expires_in, chain, group_id, note, excluded_dealers, new_traders_only } = req.body;
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
                excluded_usernames: excludedUsernames,
                new_traders_only: !!new_traders_only,
                require_kyc: !!req.body.require_kyc
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

        // Check if the order is restricted to new traders only
        if (order.payment_details?.new_traders_only) {
            if ((user.completed_trades || 0) > 0) {
                return res.status(400).json({
                    error: "This order is restricted to new traders only (0 completed trades)."
                });
            }
        }

        // Check if the order requires KYC verification
        if (order.payment_details?.require_kyc) {
            if (!user.is_verified && user.kyc_status !== "approved") {
                return res.status(400).json({
                    error: "This merchant requires Identity Verification (KYC). Please complete verification in your Profile before taking this order."
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

            // Update the Telegram broadcast message live status
            db.getOrderById(order_id).then(async (o) => {
                if (o) {
                    const orderUser = (o.user_id === seller?.id) ? seller : ((o.user_id === buyer?.id) ? buyer : await db.getUserById(o.user_id));
                    import("../bot").then(({ updateAdBroadcasts }) => {
                        if (o.status === "filled") {
                            updateAdBroadcasts(o, orderUser, "locked").catch(console.error);
                        } else {
                            updateAdBroadcasts(o, orderUser).catch(console.error);
                        }
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
                seller_hide_handle: (user as any)?.hide_group_handle,
                buyer_username: buyerUser?.username,
                buyer_first_name: buyerUser?.first_name,
                buyer_hide_handle: (buyerUser as any)?.hide_group_handle,
                release_tx_hash: releaseTxHash || trade.release_tx_hash,
            };
            const { broadcastTradeSuccess } = await import("../bot");
            await broadcastTradeSuccess(tradeWithUsername, originalOrder || trade);

            // Update broadcast message to COMPLETED on Telegram and delete database records
            db.getOrderById(trade.order_id).then(async (o) => {
                if (o) {
                    const { deleteAdBroadcasts } = await import("../bot");
                    await deleteAdBroadcasts(o.id, "completed").catch(console.error);
                }
            }).catch(console.error);
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

        // Update broadcast message back to active
        db.getOrderById(trade.order_id).then(async (o) => {
            if (o) {
                const orderUser = await db.getUserById(o.user_id);
                const { updateAdBroadcasts } = await import("../bot");
                await updateAdBroadcasts(o, orderUser, "active").catch(console.error);
            }
        }).catch(console.error);

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

// ═══════════════════════════════════════════════════════════════
//  ADMIN STATS — Rich live metrics for admin dashboard
// ═══════════════════════════════════════════════════════════════
router.get("/admin/stats", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });
        const isAdmin = env.ADMIN_IDS.includes(Number(user.telegram_id));
        if (!isAdmin) return res.status(403).json({ error: "Admin only" });

        const supabase = (db as any).getClient();
        const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();

        const [baseStats, activeTrades, todayTrades] = await Promise.all([
            db.getStats(),
            supabase
                .from("trades")
                .select("id", { count: "exact" })
                .in("status", ["in_escrow", "fiat_sent", "fiat_confirmed"]),
            supabase
                .from("trades")
                .select("amount")
                .eq("status", "completed")
                .gte("created_at", oneDayAgo),
        ]);

        const volumeToday = (todayTrades.data || []).reduce(
            (sum: number, t: any) => sum + (parseFloat(t.amount) || 0),
            0
        );

        res.json({
            total_users:     baseStats.total_users,
            total_trades:    baseStats.total_trades,
            completed_trades: baseStats.completed_trades,
            active_orders:   baseStats.active_orders,
            active_trades:   activeTrades.count || 0,
            active_disputes: baseStats.active_disputes,
            total_volume:    baseStats.total_volume_generic,
            total_fees:      baseStats.total_fees_amount,
            volume_today:    volumeToday,
        });
    } catch (err: any) {
        console.error("[ADMIN] Stats error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN TRADES — All trades list with status filter & pagination
// ═══════════════════════════════════════════════════════════════
router.get("/admin/trades", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });
        const isAdmin = env.ADMIN_IDS.includes(Number(user.telegram_id));
        if (!isAdmin) return res.status(403).json({ error: "Admin only" });

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

        const status   = (req.query.status as string) || "all";
        const page     = Math.max(1, parseInt((req.query.page as string) || "1", 10));
        const pageSize = 25;

        let query = supabase
            .from("trades")
            .select(
                "id, amount, token, chain, status, created_at, fiat_amount, rate, " +
                "seller:users!trades_seller_id_fkey(username, first_name), " +
                "buyer:users!trades_buyer_id_fkey(username, first_name)",
                { count: "exact" }
            )
            .order("created_at", { ascending: false })
            .range((page - 1) * pageSize, page * pageSize - 1);

        if (status !== "all") {
            query = query.eq("status", status);
        }

        const { data, count, error } = await query;
        if (error) throw error;

        res.json({ trades: data || [], total: count || 0, page, pageSize });
    } catch (err: any) {
        console.error("[ADMIN] Trades list error:", err);
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

            // Log dispute resolution
            try {
                await db.logDisputeResolution({
                    trade_id: trade.id,
                    admin_user_id: user.id,
                    admin_telegram_id: Number(user.telegram_id),
                    seller_id: trade.seller_id,
                    buyer_id: trade.buyer_id,
                    amount: Number(trade.amount),
                    token: trade.token,
                    chain: trade.chain,
                    released_to: 'buyer',
                    tx_hash: txHash,
                    dispute_reason: trade.dispute_reason,
                });
            } catch (logErr: any) {
                console.error("[ADMIN] Failed to log dispute resolution for buyer:", logErr);
            }

            await notifyTradeUpdate(trade.buyer_id,
                `✅ <b>Dispute Resolved!</b>\n\nAdmin has released <b>${trade.amount} ${trade.token}</b> to you.`
            );
            await notifyTradeUpdate(trade.seller_id,
                `⚠️ <b>Dispute Resolved!</b>\n\nAdmin has released <b>${trade.amount} ${trade.token}</b> to the buyer.`
            );
            res.json({ success: true, txHash });

            // Update broadcast message to COMPLETED on Telegram and delete database records
            db.getOrderById(trade.order_id).then(async (o) => {
                if (o) {
                    const { deleteAdBroadcasts } = await import("../bot");
                    await deleteAdBroadcasts(o.id, "completed").catch(console.error);
                }
            }).catch(console.error);
        } else {
            // Refund to seller
            let txHash: string | null = null;
            if (trade.on_chain_trade_id) {
                txHash = await escrow.refund(trade.on_chain_trade_id, trade.chain as any);
            }
            await db.updateTrade(trade.id, { status: "refunded" } as any);
            // Revert the fill on the parent order/ad
            await db.revertFillOrder(trade.order_id, trade.amount);

            // Log dispute resolution
            try {
                await db.logDisputeResolution({
                    trade_id: trade.id,
                    admin_user_id: user.id,
                    admin_telegram_id: Number(user.telegram_id),
                    seller_id: trade.seller_id,
                    buyer_id: trade.buyer_id,
                    amount: Number(trade.amount),
                    token: trade.token,
                    chain: trade.chain,
                    released_to: 'seller',
                    tx_hash: txHash,
                    dispute_reason: trade.dispute_reason,
                });
            } catch (logErr: any) {
                console.error("[ADMIN] Failed to log dispute resolution for seller:", logErr);
            }

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

            // Update broadcast message back to active
            db.getOrderById(trade.order_id).then(async (o) => {
                if (o) {
                    const orderUser = await db.getUserById(o.user_id);
                    const { updateAdBroadcasts } = await import("../bot");
                    await updateAdBroadcasts(o, orderUser, "active").catch(console.error);
                }
            }).catch(console.error);

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
            cdm_user_name, digital_rupee_id, bio, instagram_handle, x_handle,
            hide_group_handle
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
        if (hide_group_handle !== undefined) updates.hide_group_handle = Boolean(hide_group_handle);

        if (Object.keys(updates).length > 0) {
            await db.updateUser(user.id, updates as any);
        }

        const updatedUser = await db.getUserByTelegramId(req.telegramUser!.id);
        res.json({ user: updatedUser });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/profile/export-key", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        // Generate the private key on the fly. Do NOT log this.
        const { wallet } = await import("../services/wallet");
        const derivedWallet = wallet.deriveWallet(user.wallet_index);

        res.json({ privateKey: derivedWallet.privateKey });
    } catch (err: any) {
        // Safe error logging
        console.error("[MINIAPP] Export key failed for user", req.telegramUser!.id);
        res.status(500).json({ error: "Failed to export key" });
    }
});

// ═══════════════════════════════════════════════════════════════
//  BRIDGE — Quote via LI.FI
// ═══════════════════════════════════════════════════════════════

router.post("/bridge/quote", async (req: Request, res: Response) => {
    try {
        const { fromChainId, toChainId, fromToken, toToken, amount } = req.body;

        const response = await fetch(
            `https://li.quest/v1/quote?fromChain=${fromChainId}&toChain=${toChainId}&fromToken=${fromToken === "USDC" ? "USDC" : fromToken}&toToken=${toToken === "USDC" ? "USDC" : toToken}&fromAmount=${amount}&fromAddress=0x0000000000000000000000000000000000000000&integrator=p2pfather&fee=0.005`,
            {
                headers: {
                    'x-lifi-api-key': '2c32a108-e9b8-4563-a59a-b58a2a3264da.ecf7206c-86cd-438c-bea0-4f66a553c504'
                }
            }
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
//  DIDIT KYC INTEGRATION
// ═══════════════════════════════════════════════════════════════

router.post("/kyc/start", validateInitData, async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const apiKey = env.DIDIT_API_KEY || "DIDIT_KEY_REDACTED";
        const workflowId = env.DIDIT_WORKFLOW_ID || "b42c44f7-17c0-45ff-a068-09820bcd578b";

        const response = await fetch("https://verification.didit.me/v3/session/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey
            },
            body: JSON.stringify({
                workflow_id: workflowId,
                vendor_data: user.id
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error("[DIDIT] Session creation failed:", errBody);
            return res.status(500).json({ error: "Failed to create KYC session with Didit" });
        }

        const data = await response.json();

        try {
            const supabase = (db as any).getClient();
            await supabase
                .from("users")
                .update({
                    kyc_status: "pending",
                    kyc_session_id: data.session_id
                })
                .eq("id", user.id);
        } catch (dbErr) {
            console.warn("[KYC] Could not update DB kyc_status (column may be missing):", dbErr);
        }

        res.json({
            success: true,
            url: data.url,
            session_id: data.session_id,
            status: "pending"
        });
    } catch (err: any) {
        console.error("[KYC] Start error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.get("/kyc/status", validateInitData, async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const supabase = (db as any).getClient();
        const { data: dbUser } = await supabase
            .from("users")
            .select("kyc_status, kyc_session_id, is_verified, kyc_verified_at, kyc_country, kyc_document_type")
            .eq("id", user.id)
            .single();

        let kycStatus = dbUser?.kyc_status || (dbUser?.is_verified ? "approved" : "unverified");

        if (kycStatus === "pending" && dbUser?.kyc_session_id) {
            try {
                const apiKey = env.DIDIT_API_KEY || "DIDIT_KEY_REDACTED";
                const checkRes = await fetch(`https://verification.didit.me/v3/session/${dbUser.kyc_session_id}/decision/`, {
                    headers: { "x-api-key": apiKey }
                });
                if (checkRes.ok) {
                    const decisionData = await checkRes.json();
                    const statusStr = (decisionData.status || decisionData.decision?.status || "").toLowerCase();

                    if (statusStr === "approved") {
                        kycStatus = "approved";
                        const doc = decisionData.id_verification?.[0] || {};
                        await supabase
                            .from("users")
                            .update({
                                kyc_status: "approved",
                                is_verified: true,
                                kyc_verified_at: new Date().toISOString(),
                                kyc_country: doc.issuing_country || null,
                                kyc_document_type: doc.document_type || null
                            })
                            .eq("id", user.id);
                    } else if (statusStr === "declined" || statusStr === "rejected") {
                        kycStatus = "rejected";
                        await supabase
                            .from("users")
                            .update({ kyc_status: "rejected" })
                            .eq("id", user.id);
                    } else if (["expired", "abandoned", "failed", "cancelled"].includes(statusStr)) {
                        kycStatus = "unverified";
                        await supabase
                            .from("users")
                            .update({ kyc_status: "unverified", kyc_session_id: null })
                            .eq("id", user.id);
                    }
                }
            } catch (err) {
                console.warn("[KYC] Failed to check Didit live status:", err);
            }
        }

        res.json({
            kyc_status: kycStatus,
            is_verified: kycStatus === "approved" || !!dbUser?.is_verified,
            kyc_verified_at: dbUser?.kyc_verified_at || null,
            country: dbUser?.kyc_country || null,
            document_type: dbUser?.kyc_document_type || null
        });
    } catch (err: any) {
        console.error("[KYC] Status error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/kyc/webhook", async (req: Request, res: Response) => {
    try {
        const body = req.body;
        console.log("[DIDIT WEBHOOK] Received event:", body.event || body.type, "Session:", body.session_id);

        const userId = body.vendor_data;
        const statusStr = (body.status || body.decision?.status || "").toLowerCase();
        const supabase = (db as any).getClient();

        if (userId && statusStr === "approved") {
            const doc = body.id_verification?.[0] || {};
            await supabase
                .from("users")
                .update({
                    kyc_status: "approved",
                    is_verified: true,
                    kyc_verified_at: new Date().toISOString(),
                    kyc_country: doc.issuing_country || null,
                    kyc_document_type: doc.document_type || null
                })
                .eq("id", userId);
            console.log(`[DIDIT WEBHOOK] ✅ User ${userId} successfully KYC verified!`);
        } else if (userId && (statusStr === "declined" || statusStr === "rejected")) {
            await supabase
                .from("users")
                .update({ kyc_status: "rejected" })
                .eq("id", userId);
            console.log(`[DIDIT WEBHOOK] ❌ User ${userId} KYC rejected.`);
        }

        res.json({ received: true });
    } catch (err: any) {
        console.error("[DIDIT WEBHOOK] Error:", err);
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



const polygonProvider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com', 137, { staticNetwork: true });

const ctfContractShared = new ethers.Contract(
    '0x4d97dcd97ec945f40cf65f87097ace5ea0476045',
    [
        'function payoutDenominator(bytes32) view returns (uint256)',
        'function payoutNumerators(bytes32, uint256) view returns (uint256)'
    ],
    polygonProvider
);

const conditionResolutionCache = new Map<string, { denominator: number, num0: number, num1: number }>();

async function getConditionResolution(cid: string): Promise<{ denominator: number, num0: number, num1: number } | null> {
    const cacheKey = cid.toLowerCase();
    
    // 1. Check in-memory cache
    let resolution = conditionResolutionCache.get(cacheKey);
    if (resolution) return resolution;

    // 2. Check Redis cache
    try {
        const cached = await redis.get(`resolution:${cacheKey}`);
        if (cached) {
            resolution = JSON.parse(cached);
            if (resolution) {
                conditionResolutionCache.set(cacheKey, resolution);
                return resolution;
            }
        }
    } catch (err: any) {
        console.warn("[MINIAPP] Redis get resolution error:", err.message);
    }

    // 3. Fallback to on-chain query
    try {
        const denominator = await ctfContractShared.payoutDenominator(cid as `0x${string}`).catch(() => 0n);
        if (denominator > 0n) {
            const [num0, num1] = await Promise.all([
                ctfContractShared.payoutNumerators(cid as `0x${string}`, 0n).catch(() => 0n),
                ctfContractShared.payoutNumerators(cid as `0x${string}`, 1n).catch(() => 0n)
            ]);
            resolution = {
                denominator: Number(denominator),
                num0: Number(num0),
                num1: Number(num1)
            };
            conditionResolutionCache.set(cacheKey, resolution);
            
            // Save to Redis (cache forever)
            try {
                await redis.set(`resolution:${cacheKey}`, JSON.stringify(resolution));
            } catch (redisErr: any) {
                console.warn("[MINIAPP] Redis set resolution error:", redisErr.message);
            }
            return resolution;
        }
    } catch (e: any) {
        console.warn(`[MINIAPP] On-chain resolution query failed for ${cid}:`, e.message);
    }
    return null;
}
let leaderboardCache: { data: any[]; ts: number } | null = null;
const LEADERBOARD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

router.get("/predictions/leaderboard", async (req: Request, res: Response) => {
    console.log("=== HIT PREDICTIONS LEADERBOARD ROUTE IN MINIAPP.TS ===");
    
    // Serve from cache if valid — but recompute is_me per user
    if (leaderboardCache && Date.now() - leaderboardCache.ts < LEADERBOARD_CACHE_TTL) {
        console.log("[Leaderboard] Serving from cache");
        const currentUserId = req.telegramUser?.id;
        const withMe = leaderboardCache.data.map((row: any) => ({
            ...row,
            is_me: currentUserId === row._telegram_id,
        }));
        return res.json({ leaderboard: withMe });
    }
    try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY);
        
        const { data: stats, error } = await supabase
            .from("prediction_user_stats")
            .select(`
                telegram_id,
                username,
                total_trades,
                total_wins,
                total_losses,
                total_wagered,
                realized_pnl,
                users ( first_name, photo_url )
            `)
            .order("total_wagered", { ascending: false })
            .limit(100);

        if (error) {
            console.error("[Leaderboard] Supabase query error:", error.message);
            throw error;
        }

        const currentUserId = req.telegramUser?.id;
        const leaderboard = (stats || []).map((s: any, i: number) => {
            const firstName = s.users?.first_name || '';
            const displayName = firstName || s.username || 'Anonymous';
            const totalWagered = parseFloat(s.total_wagered || '0');
            const realizedPnl = parseFloat(s.realized_pnl || '0');
            const wins = s.total_wins || 0;
            const losses = s.total_losses || 0;
            const winRatio = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) + '%' : '0%';

            return {
                rank: i + 1,
                _telegram_id: s.telegram_id, // kept for cache is_me injection
                user: displayName,
                photo_url: s.users?.photo_url || '',
                pred: `$${totalWagered.toFixed(2)}`,
                pnl: `${realizedPnl >= 0 ? '+' : ''}$${realizedPnl.toFixed(2)}`,
                trades: s.total_trades || 0,
                wins,
                losses,
                winRatio,
            };
        });

        leaderboardCache = { data: leaderboard, ts: Date.now() };

        // Serve with is_me injected fresh for this request
        const withMe = leaderboard.map((row: any) => ({
            ...row,
            is_me: currentUserId === row._telegram_id,
        }));
        res.json({ leaderboard: withMe });
    } catch (err: any) {
        console.error("[MINIAPP] Predictions leaderboard error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.get("/predictions/copy-traders", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const supabase = db.getClient();
        
        // Fetch all users who allow copy trading
        const { data: statsList, error: statsErr } = await supabase
            .from("prediction_user_stats")
            .select("*")
            .eq("allow_copy_trading", true);

        if (statsErr) throw statsErr;
        if (!statsList || statsList.length === 0) {
            return res.json({ traders: [] });
        }

        const traders = await Promise.all(statsList.map(async (trader) => {
            // Count active copiers
            const { count, error: countErr } = await supabase
                .from("copy_connections")
                .select("*", { count: "exact", head: true })
                .eq("lead_user_id", trader.user_id)
                .eq("active", true);

            const copies = count || 0;
            const tradesCount = trader.total_trades || 0;
            const winRate = tradesCount > 0 ? `${((trader.total_wins / tradesCount) * 100).toFixed(1)}%` : '0.0%';

            return {
                id: trader.user_id,
                telegramId: Number(trader.telegram_id),
                name: trader.username || `User ${trader.telegram_id}`,
                username: trader.username || "",
                copiersCount: copies,
                pnl: trader.realized_pnl ? `$${parseFloat(trader.realized_pnl).toFixed(2)}` : '$0.00',
                vol: trader.total_wagered ? `$${parseFloat(trader.total_wagered).toFixed(2)}` : '$0.00',
                winRate,
                ratio: `${trader.total_wins || 0}W / ${trader.total_losses || 0}L`,
                isMe: trader.user_id === user.id
            };
        }));

        // Sort by copiers count first, then PNL descending
        traders.sort((a, b) => {
            if (b.copiersCount !== a.copiersCount) return b.copiersCount - a.copiersCount;
            const pnlA = parseFloat(a.pnl.replace('$', ''));
            const pnlB = parseFloat(b.pnl.replace('$', ''));
            return pnlB - pnlA;
        });

        // Assign rank dynamically
        const rankedTraders = traders.map((t, idx) => ({ ...t, rank: idx + 1 }));

        res.json({ traders: rankedTraders });
    } catch (err: any) {
        console.error("[MINIAPP] Get copy traders error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/predictions/copy-traders/toggle-lead", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const { allowCopyTrading } = req.body;
        if (allowCopyTrading === undefined) return res.status(400).json({ error: "Missing allowCopyTrading" });

        const supabase = db.getClient();
        
        // Ensure prediction_user_stats row exists, then update allow_copy_trading
        const { error } = await supabase
            .from("prediction_user_stats")
            .upsert({
                user_id: user.id,
                telegram_id: user.telegram_id,
                username: user.username,
                allow_copy_trading: !!allowCopyTrading,
                updated_at: new Date().toISOString()
            }, { onConflict: "user_id" });

        if (error) throw error;
        res.json({ success: true, allowCopyTrading: !!allowCopyTrading });
    } catch (err: any) {
        console.error("[MINIAPP] Toggle lead status error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/predictions/copy-traders/copy", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const { leadUserId, amountType, amountValue } = req.body;
        if (!leadUserId || !amountType || amountValue === undefined) {
            return res.status(400).json({ error: "Missing leadUserId, amountType, or amountValue" });
        }

        const supabase = db.getClient();

        // 1. Get lead user info to verify existence and get telegram_id
        const { data: leadUser, error: leadErr } = await supabase
            .from("users")
            .select("telegram_id, username")
            .eq("id", leadUserId)
            .single();

        if (leadErr || !leadUser) {
            return res.status(404).json({ error: "Lead trader user not found" });
        }

        if (leadUserId === user.id) {
            return res.status(400).json({ error: "You cannot copy trade yourself" });
        }

        // 2. Deactivate other active copy connections for this copier to enforce "one lead at a time"
        await supabase
            .from("copy_connections")
            .update({ active: false, updated_at: new Date().toISOString() })
            .eq("copier_user_id", user.id)
            .neq("lead_user_id", leadUserId);

        // 3. Setup/activate the target connection
        const { error } = await supabase
            .from("copy_connections")
            .upsert({
                copier_user_id: user.id,
                copier_telegram_id: user.telegram_id,
                lead_user_id: leadUserId,
                lead_telegram_id: Number(leadUser.telegram_id),
                amount_type: amountType,
                amount_value: parseFloat(amountValue),
                active: true,
                updated_at: new Date().toISOString()
            }, { onConflict: "copier_user_id,lead_user_id" });

        if (error) throw error;

        // Notify lead trader that someone is copying them (adds to premium feel!)
        try {
            const leadMsg = `👥 <b>New Copy Follower!</b>\n\n@${user.username || 'A user'} started copy trading you with a <b>${amountType}</b> configuration of <b>${amountType === 'FIXED' ? '$' : ''}${amountValue}${amountType === 'PROPORTIONAL' ? 'x' : ''}</b>. Keep up the good work!`;
            await bot.api.sendMessage(leadUser.telegram_id, leadMsg, { parse_mode: "HTML" }).catch(() => {});
        } catch {}

        res.json({ success: true });
    } catch (err: any) {
        console.error("[MINIAPP] Start copy trade error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/predictions/copy-traders/stop", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const { leadUserId } = req.body;
        if (!leadUserId) return res.status(400).json({ error: "Missing leadUserId" });

        const supabase = db.getClient();

        const { error } = await supabase
            .from("copy_connections")
            .update({ active: false, updated_at: new Date().toISOString() })
            .eq("copier_user_id", user.id)
            .eq("lead_user_id", leadUserId);

        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        console.error("[MINIAPP] Stop copy trade error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.get("/predictions/copy-traders/status", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const supabase = db.getClient();

        // 1. Fetch user's lead settings
        const { data: stats } = await supabase
            .from("prediction_user_stats")
            .select("allow_copy_trading")
            .eq("user_id", user.id)
            .single();

        // 2. Fetch user's active copy configurations
        const { data: connections } = await supabase
            .from("copy_connections")
            .select("*")
            .eq("copier_user_id", user.id)
            .eq("active", true);

        const activeConnection = (connections && connections.length > 0) ? connections[0] : null;

        res.json({
            allowCopyTrading: stats?.allow_copy_trading || false,
            copying: activeConnection ? {
                leadUserId: activeConnection.lead_user_id,
                leadTelegramId: Number(activeConnection.lead_telegram_id),
                amountType: activeConnection.amount_type,
                amountValue: Number(activeConnection.amount_value)
            } : null
        });
    } catch (err: any) {
        console.error("[MINIAPP] Get copy status error:", err);
        res.status(500).json({ error: err.message });
    }
});

/** Fetch the exact open price of the current 5-minute round from Binance */
async function getCurrentRoundOpenPrice(): Promise<number | null> {
    try {
        const roundStartMs = Math.floor(Date.now() / 300000) * 300000;
        const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&startTime=${roundStartMs}&limit=1`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            return parseFloat(data[0][1]); // index 1 = open price
        }
    } catch (err: any) {
        console.warn('[RoundOpen] Failed to fetch round open price:', err.message);
    }
    return null;
}

async function getCachedBitcoinHistory(): Promise<any[]> {
    const cacheKey = "btc_price_history_cache";
    try {
        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (err: any) {
        console.warn("[History] Redis get error:", err.message);
    }

    try {
        const binanceRes = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=100", { signal: AbortSignal.timeout(5000) });
        const data = await binanceRes.json();
        
        if (!Array.isArray(data)) {
            throw new Error("Invalid klines data from Binance");
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

        try {
            await redis.setex(cacheKey, 30, JSON.stringify(history));
        } catch (redisErr: any) {
            console.warn("[History] Redis set error:", redisErr.message);
        }

        return history;
    } catch (err: any) {
        console.error("[History] Fetch failed, returning empty:", err.message);
        return [];
    }
}

router.get("/predictions/history", async (req: Request, res: Response) => {
    try {
        const history = await getCachedBitcoinHistory();
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

        const address = await polymarketRelayerService.resolveDepositWallet(user.wallet_index, (user as any).deposit_wallet_address);
        
        // Try to read from cache first
        const cacheKey = `evm_bridge_address:${address.toLowerCase()}`;
        let evmBridgeAddress = "";
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                evmBridgeAddress = cached;
            }
        } catch (e: any) {
            console.warn("[MINIAPP] Redis read error for bridge address:", e.message);
        }

        // Fetch from Polymarket Bridge API if not cached
        if (!evmBridgeAddress) {
            try {
                console.log(`[MINIAPP] Fetching EVM bridge address for proxy ${address}...`);
                const depositRes = await fetch("https://bridge.polymarket.com/deposit", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Builder-Code": (process.env as any).POLYMARKET_BUILDER_CODE || ""
                    },
                    body: JSON.stringify({ address })
                });
                
                if (depositRes.ok) {
                    const data: any = await depositRes.json();
                    evmBridgeAddress = data.address?.evm ?? data.evm ?? data.evmAddress ?? "";
                    
                    if (evmBridgeAddress) {
                        // Cache it for 30 days
                        try {
                            await redis.setex(cacheKey, 30 * 24 * 3600, evmBridgeAddress);
                        } catch (e: any) {
                            console.warn("[MINIAPP] Redis write error for bridge address:", e.message);
                        }
                    }
                } else {
                    const errText = await depositRes.text();
                    console.error(`[MINIAPP] Polymarket Bridge API error (${depositRes.status}):`, errText);
                }
            } catch (e: any) {
                console.error("[MINIAPP] Failed to fetch bridge address:", e.message);
            }
        }

        res.json({ address, evmBridgeAddress });
    } catch (err: any) {
        console.error("[MINIAPP] Get predictions deposit wallet error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.get("/predictions/clob-keys", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const address = await polymarketRelayerService.resolveDepositWallet(user.wallet_index, (user as any).deposit_wallet_address);
        
        // Return proxy address and CLOB API keys if they exist in DB
        res.json({
            address,
            apiKey: user.polymarket_api_key,
            secret: user.polymarket_secret,
            passphrase: user.polymarket_passphrase
        });
    } catch (err: any) {
        console.error("[MINIAPP] Get predictions clob keys error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.get("/predictions/open-orders", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const market = await polymarketService.getActiveBtcMarket();
        const ordersRes = await polymarketService.getOpenOrders(user.wallet_index);
        
        res.json({ success: true, orders: Array.isArray(ordersRes) ? ordersRes : (ordersRes as any)?.orders || [] });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/predictions/cancel-order", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const { orderId } = req.body;
        if (!orderId) return res.status(400).json({ error: "Missing orderId" });

        if (orderId === "ALL") {
            await polymarketService.cancelAllOrders(user.wallet_index);
        } else {
            await polymarketService.cancelOrder(user.wallet_index, orderId);
        }
        res.json({ success: true });
    } catch (err: any) {
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
        
        // Prevent betting on expired/ended rounds
        const now = Date.now();
        const endsAt = new Date(market.endsAt).getTime();
        if (now >= endsAt) {
            return res.status(400).json({ error: "Round has already ended. Please wait for the next round." });
        }

        const tokenId = outcome === 'UP' || outcome === 'YES' ? market.yesTokenId : market.noTokenId;
        const limitPrice = price ? parseFloat(price) : 0.50;
        const betSide = side || "BUY";
        const orderType = req.body.orderType === "LIMIT" ? "LIMIT" : "MARKET";

        let finalAmount = parseFloat(amount);
        if (betSide === "SELL") {
            try {
                const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index, (user as any).deposit_wallet_address);
                if (proxyAddress) {
                    const positionsData = await polymarketService.getPositionsForProxy(proxyAddress).catch(() => []);
                    const activePos = positionsData.find((p: any) => (p.asset || "").toLowerCase() === tokenId.toLowerCase());
                    if (activePos && parseFloat(activePos.size) > 0) {
                        const maxShares = parseFloat(activePos.size);
                        // If requested amount exceeds maxShares, or is very close to it (within 0.01), clamp it to maxShares
                        if (finalAmount > maxShares || Math.abs(finalAmount - maxShares) < 0.01) {
                            console.log(`[MINIAPP] Clamping sell amount from ${finalAmount} to actual on-chain shares ${maxShares}`);
                            finalAmount = maxShares;
                        }
                    }
                }
            } catch (clampErr: any) {
                console.warn("[MINIAPP] Failed to auto-clamp sell amount:", clampErr.message);
            }
        }

        const result = await polymarketService.placeBet(
            user.wallet_index,
            tokenId,
            finalAmount,
            limitPrice,
            betSide,
            orderType,
            market.conditionId
        );

        if (result && result.error) {
            throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error));
        }

        // Optimistically insert trade into our DB for instant history feedback
        try {
            const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index, (user as any).deposit_wallet_address);
            
            // Extract Polymarket's order ID if available, otherwise fallback to local timestamp-based ID
            let clobTradeId = `opt_${Date.now()}`;
            if (result && result.orderID) {
                clobTradeId = result.orderID;
            } else if (result && result.transactionHash) {
                clobTradeId = result.transactionHash;
            }

            await db.getClient().from("prediction_trades").insert({
                user_id: user.id,
                telegram_id: user.telegram_id,
                username: user.username,
                proxy_address: proxyAddress || '',
                clob_trade_id: clobTradeId,
                condition_id: market.conditionId,
                token_id: tokenId,
                outcome: outcome === 'UP' || outcome === 'YES' ? 'UP' : 'DOWN',
                side: betSide,
                price: limitPrice,
                shares: betSide === "SELL" ? finalAmount : finalAmount / limitPrice,
                cost_usdc: betSide === "SELL" ? finalAmount * limitPrice : finalAmount,
                traded_at: new Date().toISOString()
            });
            console.log(`[MINIAPP] Optimistically inserted trade ${clobTradeId} for user ${user.telegram_id}`);
            
            // Clear prediction cache to ensure snapshot re-fetches the new optimistic history
            await polymarketService.clearUserPredictionsCache(user.telegram_id);
        } catch (optErr: any) {
            console.warn(`[MINIAPP] Failed to optimistically insert trade:`, optErr.message);
        }

        // Bust leaderboard cache so this trade's volume shows immediately
        leaderboardCache = null;

        // Record the trade for the leaderboard
        try {
            await db.getClient().from("miniapp_trades").insert({
                telegram_id: user.telegram_id,
                amount: betSide === "SELL" ? finalAmount * limitPrice : finalAmount,
                side: betSide,
            });
        } catch (dbErr: any) {
            console.warn("[MINIAPP] Failed to record trade for leaderboard (table might not exist yet):", dbErr.message);
        }

        // Record the trade in the prediction_trades table immediately
        try {
            const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index, (user as any).deposit_wallet_address);
            if (proxyAddress) {
                polymarketService.clearUserCache(proxyAddress);
                const rawTrades = await polymarketService.getTradesForProxy(proxyAddress).catch(() => []);
                if (rawTrades && rawTrades.length > 0) {
                    // Reconcile optimistic trades first
                    await polymarketService.reconcileAndCleanupTrades(user.telegram_id, proxyAddress, rawTrades);

                    const rows = rawTrades.map((t: any) => {
                        const assetLc = (t.asset_id || '').toLowerCase();
                        const rawOutcome = String(t.outcome || '').toUpperCase();
                        const outcome = (rawOutcome === 'YES' || rawOutcome === 'UP' || t.outcomeIndex === 0) ? 'UP' : 'DOWN';
                        const side = (t.side || 'BUY').toUpperCase();
                        const price = parseFloat(t.price ?? '0');
                        const shares = parseFloat(t.size ?? '0');
                        const cost = shares * price;

                        let tradedAt = new Date().toISOString();
                        if (t.create_time) tradedAt = new Date(t.create_time).toISOString();
                        else if (t.timestamp) {
                            const raw = t.timestamp.toString();
                            tradedAt = raw.includes('T') ? raw : new Date(parseInt(raw) * 1000).toISOString();
                        }

                        return {
                            user_id: user.id,
                            telegram_id: user.telegram_id,
                            username: user.username,
                            proxy_address: proxyAddress,
                            clob_trade_id: t.id ?? t.trade_id ?? t.transactionHash ?? crypto.createHash('md5').update(`${proxyAddress}-${t.conditionId || t.market}-${t.side}-${t.price}-${t.size}-${t.timestamp || t.create_time}`).digest('hex'),
                            condition_id: t.market ?? t.conditionId ?? '',
                            token_id: assetLc,
                            outcome,
                            side,
                            price,
                            shares,
                            cost_usdc: cost,
                            traded_at: tradedAt,
                        };
                    }).filter((r: any) => r.condition_id && r.shares > 0);

                    if (rows.length > 0) {
                        await db.getClient()
                            .from('prediction_trades')
                            .upsert(rows, { onConflict: 'clob_trade_id', ignoreDuplicates: true });
                    }
                }
            }
        } catch (syncErr: any) {
            console.warn("[MINIAPP] Failed to record prediction_trades immediately after bet:", syncErr.message);
        }

        // Clear cached positions and trades so next fetch gets new state
        try {
            const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index, (user as any).deposit_wallet_address);
            if (proxyAddress) {
                polymarketService.clearUserCache(proxyAddress);
            }
        } catch {}

        // Clear predictions snapshot cache (Supabase / Redis)
        await polymarketService.clearUserPredictionsCache(user.telegram_id);


        // Trigger copy trading replication for followers in the background
        try {
            const { CopyTradingService } = await import("../services/copy-trading");
            CopyTradingService.triggerCopyTrades(
                user.telegram_id,
                tokenId,
                finalAmount,
                limitPrice,
                outcome,
                betSide
            ).catch((copyErr) => console.error("[Copy Trading] Replicate trigger error:", copyErr));
        } catch (copyErr) {
            console.error("[Copy Trading] Failed to import/execute copy trading replication:", copyErr);
        }

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
        const wrapped = await depositMonitor.forceCheckUser(user.wallet_index, (user as any).deposit_wallet_address);
        
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

        // Enforce higher minimum for cross-chain bridges to prevent stuck deposits
        const isNonPolygon = (chain || 'polygon').toLowerCase() !== 'polygon';
        if (isNonPolygon && parseFloat(amount) < 3) {
            return res.status(400).json({ error: "Minimum deposit is 3 USDC for bridge transfers (Base/BSC) to avoid stuck funds" });
        }

        const amountBigInt = BigInt(Math.floor(parseFloat(amount) * 1_000_000));
        const { txHash, bridgeAddress } = await polymarketRelayerService.depositGasless(user.wallet_index, amountBigInt, chain, token);

        // Track cross-chain bridge deposits so we can notify the user when pUSD arrives (or if it's stuck)
        if (isNonPolygon && txHash) {
            bridgeMonitor.trackDeposit({
                telegramId: Number(user.telegram_id),
                walletIndex: user.wallet_index,
                txHash,
                sourceChain: chain,
                amountUsdc: parseFloat(amount),
            }).catch(() => {}); // fire-and-forget
        }

        res.json({ success: true, txHash, bridgeAddress });
    } catch (err: any) {
        console.error("[MINIAPP] Gasless deposit error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/predictions/withdraw/quote", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const { amount, destChainId, destTokenAddress, recipientAddress } = req.body;
        if (!amount || !destChainId || !destTokenAddress) return res.status(400).json({ error: "Missing parameters" });

        const toAddress = recipientAddress || user.wallet_address;
        
        const quote = await polymarketRelayerService.getCrossChainWithdrawalQuote(parseFloat(amount), destChainId.toString(), destTokenAddress, toAddress);
        res.json({ success: true, ...quote });
    } catch (err: any) {
        console.error("[MINIAPP] Withdraw quote error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/predictions/withdraw", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const { amount, recipientAddress, destChainId, destTokenAddress } = req.body;
        if (!amount) return res.status(400).json({ error: "Missing amount" });

        const toAddress = recipientAddress || user.wallet_address;
        if (!toAddress) return res.status(400).json({ error: "Recipient address not found" });

        const amountBigInt = BigInt(Math.floor(parseFloat(amount) * 1_000_000));
        
        // The user specifically requested to remove cross-chain bridge logic 
        // and just withdraw native pUSD directly to the recipient wallet.
        const txHash = await polymarketRelayerService.withdrawGasless(user.wallet_index, toAddress, amountBigInt);

        res.json({ success: true, txHash, isCrossChain: false });
    } catch (err: any) {
        console.error("[MINIAPP] Gasless withdraw error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.get("/predictions/withdraw/status/:bridgeAddress", async (req: Request, res: Response) => {
    try {
        const { bridgeAddress } = req.params;
        const { data } = await axios.get(`https://bridge.polymarket.com/status/${bridgeAddress}`);
        res.json({ success: true, status: data });
    } catch (err: any) {
        console.error("[MINIAPP] Bridge status error:", err.message);
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
    console.log(`[Positions] Fetching positions for user ${req.telegramUser?.id}`);
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        // Resolve active market first
        const activeMarket = await polymarketService.getActiveBtcMarket().catch(() => null);

        // Try reading user snapshot from predictions_cache (Supabase / Redis)
        const cached = await polymarketService.getUserPredictionsCache(user.telegram_id);
        if (cached && cached.positions && activeMarket && cached.marketSlug === activeMarket.slug) {
            // ✅ Include realizedPnl from cache — previously missing, causing frontend to show $0.00
            return res.json({ positions: cached.positions, realizedPnl: cached.realizedPnl ?? 0 });
        }

        const all = req.query.all === 'true';

        // Attempt to get real open positions from Polymarket Data API
        try {
            const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index, (user as any).deposit_wallet_address);
            console.log("[DEBUG] Fetching positions for deposit wallet:", proxyAddress);
            if (!proxyAddress) {
                return res.json({ positions: [] });
            }
            // Fetch trades, positions, and active market in parallel
            const [tradesRes, positionsRes, market] = await Promise.all([
                polymarketService.getTradesForProxy(proxyAddress),
                polymarketService.getPositionsForProxy(proxyAddress).catch(() => []),
                activeMarket ? Promise.resolve(activeMarket) : polymarketService.getActiveBtcMarket()
            ]);

            // Auto-claim background check disabled - using manual claim buttons instead

            // Get outcome prices in parallel
            const priceResults = await Promise.allSettled([
                polymarketService.getOutcomePrice(market.yesTokenId, false),
                polymarketService.getOutcomePrice(market.noTokenId, true),
            ]);

            const yesPrice = priceResults[0].status === 'fulfilled' ? priceResults[0].value : null;
            const noPrice = priceResults[1].status === 'fulfilled' ? priceResults[1].value : null;

            // Aggregate open positions from recent trades
            const positionMap: Record<string, { outcome: string; asset: string; title?: string; qty: number; totalCost: number; avgPrice: number; currentPrice: number | null; conditionId?: string }> = {};
            const yesTokenIdLc = market.yesTokenId.toLowerCase();
            const noTokenIdLc = market.noTokenId.toLowerCase();

            let activeRealizedPnl = 0;
            const sortedTrades = [...(tradesRes || [])].reverse(); // Oldest first for accurate avg price calculation

            for (const trade of sortedTrades) {
                const tradeAssetLc = (trade.asset_id || trade.asset || "").toLowerCase();
                const isUp = tradeAssetLc === yesTokenIdLc;
                const isDown = tradeAssetLc === noTokenIdLc;
                if (!all && !isUp && !isDown) continue;

                const key = all ? tradeAssetLc : (isUp ? "UP" : "DOWN");
                const qty = parseFloat(trade.size ?? "0");
                const price = parseFloat(trade.price ?? "0");
                const isSell = trade.side === "SELL";

                if (!positionMap[key]) {
                    positionMap[key] = {
                        outcome: all ? (trade.outcomeIndex === 0 ? 'UP' : 'DOWN') : (isUp ? 'UP' : 'DOWN'),
                        asset: tradeAssetLc,
                        title: trade.title,
                        qty: 0,
                        totalCost: 0,
                        avgPrice: 0,
                        currentPrice: isUp ? yesPrice?.buyPrice ?? null : (isDown ? noPrice?.buyPrice ?? null : parseFloat(trade.price ?? "0")),
                        conditionId: trade.conditionId || trade.market || "",
                    };
                }

                if (isSell) {
                    const avgEntryPrice = positionMap[key].qty > 0 ? positionMap[key].totalCost / positionMap[key].qty : 0;
                    activeRealizedPnl += (price - avgEntryPrice) * qty;
                    positionMap[key].qty -= qty;
                    positionMap[key].totalCost -= avgEntryPrice * qty;
                } else {
                    positionMap[key].qty += qty;
                    positionMap[key].totalCost += qty * price;
                }
            }

            // Sync qty with Data API to reflect redemptions correctly
            for (const key of Object.keys(positionMap)) {
                const tokenIdLc = all ? key : (key === "UP" ? yesTokenIdLc : noTokenIdLc);
                const activePos = positionsRes.find((p: any) => (p.asset || "").toLowerCase() === tokenIdLc);
                

                // If avgPrice was calculated, keep it. But override qty.
                if (positionMap[key].qty > 0) {
                    positionMap[key].avgPrice = positionMap[key].totalCost / positionMap[key].qty;
                }

                if (activePos && parseFloat(activePos.size) > 0 && !activePos.redeemable) {
                    const syncedQty = parseFloat(activePos.size);
                    
                    if (activePos.initialValue !== undefined) {
                        // Polymarket gives us ground-truth cost basis — use it
                        const initialValue = parseFloat(activePos.initialValue);
                        positionMap[key].qty = syncedQty;
                        positionMap[key].totalCost = initialValue;
                        positionMap[key].avgPrice = initialValue / syncedQty;
                    } else {
                        // No initialValue — trust our trade-loop totalCost, only sync qty
                        // Adjust totalCost proportionally if qty changed (e.g. redemption reduced shares)
                        const oldQty = positionMap[key].qty;
                        if (oldQty > 0 && syncedQty !== oldQty) {
                            positionMap[key].totalCost = (positionMap[key].totalCost / oldQty) * syncedQty;
                        }
                        positionMap[key].qty = syncedQty;
                        positionMap[key].avgPrice = positionMap[key].qty > 0
                            ? positionMap[key].totalCost / positionMap[key].qty
                            : 0;
                    }
                } else if (activePos && activePos.redeemable) {
                    positionMap[key].qty = 0;
                } else if (!activePos) {
                    // If this belongs to a historical round, it's definitely closed, not cache lag!
                    const posConditionId = positionMap[key].conditionId;
                    if (posConditionId && posConditionId.toLowerCase() !== market.conditionId.toLowerCase()) {
                        positionMap[key].qty = 0;
                    } else {
                        // Missing from Data API (likely cache lag on recent entry). Keep trade qty!
                    }
                } else {
                    positionMap[key].qty = 0;
                }
            }

            // Fallback: Ensure any active positions from Polymarket positionsRes are added even if not present in positionMap
            for (const p of positionsRes) {
                const assetLc = (p.asset || "").toLowerCase();
                const isYes = assetLc === yesTokenIdLc;
                const isNo = assetLc === noTokenIdLc;
                if (!all && !isYes && !isNo) continue;

                const key = all ? assetLc : (isYes ? "UP" : "DOWN");
                const syncedQty = parseFloat(p.size || "0");
                if (syncedQty > 0.001 && !p.redeemable) {
                    if (!positionMap[key]) {
                        const initialValue = p.initialValue !== undefined ? parseFloat(p.initialValue) : 0;
                        positionMap[key] = {
                            outcome: all ? (p.outcomeIndex === 0 ? 'UP' : 'DOWN') : (isYes ? 'UP' : 'DOWN'),
                            asset: assetLc,
                            title: p.title || (isYes ? "Bitcoin Price > Strike" : "Bitcoin Price <= Strike"),
                            qty: syncedQty,
                            totalCost: initialValue,
                            avgPrice: syncedQty > 0 ? initialValue / syncedQty : 0,
                            currentPrice: isYes ? yesPrice?.buyPrice ?? null : (isNo ? noPrice?.buyPrice ?? null : null),
                        };
                    }
                }
            }

            // Calculate realized PNL using trade history + on-chain resolution
            // The Data API removes redeemed positions entirely, so we compute from trades:
            // Group BUY trades by conditionId → for resolved conditions not in active positions,
            // profit = shares * payoutFraction - cost  (payoutFraction = payoutNumerator/denominator)
            let realizedPnl = activeRealizedPnl; // Include partial sells from active market
            try {
                // Step 1: Use cached getPositionsForProxy with threshold "0"
                const allPositions = await polymarketService.getPositionsForProxy(proxyAddress, "0").catch(() => []);
                const openConditionIds = new Set<string>();
                if (Array.isArray(allPositions) && allPositions.length > 0) {
                    for (const p of allPositions) {
                        realizedPnl += parseFloat(p.cashPnl ?? '0') || 0;
                        openConditionIds.add(p.conditionId);
                    }
                }

                // Step 2: Use already fetched/cached trades to avoid duplicate network call
                const allTrades = tradesRes || [];
                if (Array.isArray(allTrades) && allTrades.length > 0) {
                    // Group by conditionId → track net buy cost and shares
                    const conditionMap: Record<string, { cost: number; shares: number; outcomeIndex: number }> = {};
                    for (const t of allTrades) {
                        const cid = t.conditionId;
                        if (!cid) continue;
                        const size = parseFloat(t.size ?? '0');
                        const price = parseFloat(t.price ?? '0');
                        if (!conditionMap[cid]) conditionMap[cid] = { cost: 0, shares: 0, outcomeIndex: t.outcomeIndex ?? 1 };
                        if (t.side === 'BUY') {
                            conditionMap[cid].cost += size * price;
                            conditionMap[cid].shares += size;
                        } else if (t.side === 'SELL') {
                            conditionMap[cid].cost -= size * price;
                            conditionMap[cid].shares -= size;
                        }
                    }

                    // Step 3: For conditions NOT in active positions (already redeemed), check cached/on-chain resolution
                    const pnlPromises = Object.entries(conditionMap).map(async ([cid, data]) => {
                        if (openConditionIds.has(cid)) return 0;
                        if (data.shares <= 0.001) return 0;
                        try {
                            const res = await getConditionResolution(cid);
                            if (!res) return 0;
                            const num = data.outcomeIndex === 0 ? res.num0 : res.num1;
                            const payoutFraction = num / res.denominator;
                            const profit = data.shares * payoutFraction - data.cost;
                            console.log(`[PNL] Resolved condition ${cid.slice(0,12)}: shares=${data.shares.toFixed(3)}, cost=$${data.cost.toFixed(3)}, payout=${payoutFraction}, profit=$${profit.toFixed(3)}`);
                            return profit;
                        } catch {
                            return 0;
                        }
                    });
                    const resolvedPnls = await Promise.all(pnlPromises);
                    for (const profit of resolvedPnls) {
                        realizedPnl += profit;
                    }
                }
            } catch (e: any) {
                console.warn('[MINIAPP] Realized PNL calculation error:', e.message);
            }

            // Build final positions list
            const positions = Object.values(positionMap)
                .filter(p => all || p.qty > 0.001)
                .map(p => {
                    const effectivePrice = p.currentPrice ?? p.avgPrice;
                    const value = p.qty * effectivePrice;
                    const cost = p.qty * p.avgPrice;
                    const returnAmt = value - cost;
                    const returnPct = cost > 0 ? (returnAmt / cost) * 100 : 0;
                    return {
                        outcome: p.outcome,
                        qty: parseFloat(p.qty.toFixed(6)),
                        avg: parseFloat(p.avgPrice.toFixed(2)),
                        currentPrice: parseFloat(effectivePrice.toFixed(2)),
                        value: parseFloat(value.toFixed(2)),
                        cost: parseFloat(cost.toFixed(2)),
                        returnAmt: parseFloat(returnAmt.toFixed(2)),
                        returnPct: parseFloat(returnPct.toFixed(2)),
                        title: p.title,
                    };
                });

            return res.json({ positions, realizedPnl: parseFloat(realizedPnl.toFixed(2)) });
        } catch (innerErr: any) {
            console.warn("[MINIAPP] Real positions fetch failed, returning empty:", innerErr.message);
            // Return empty positions — include realizedPnl: 0 so frontend doesn't stay at undefined
            return res.json({ positions: [], realizedPnl: 0 });
        }
    } catch (err: any) {
        console.error("[MINIAPP] Get predictions positions error:", err);
        res.status(500).json({ error: err.message });
    }
});

export async function refreshUserSnapshotCache(user: any, proxyAddress: string): Promise<any> {
    try {
        const market = await polymarketService.getActiveBtcMarket().catch(() => null);

        // Fetch prices from CLOB
        const [yesPrice, noPrice] = await Promise.all([
            market ? polymarketService.getOutcomePrice(market.yesTokenId, false).catch(() => ({ buyPrice: 0.5, sellPrice: 0.5 })) : { buyPrice: 0.5, sellPrice: 0.5 },
            market ? polymarketService.getOutcomePrice(market.noTokenId, true).catch(() => ({ buyPrice: 0.5, sellPrice: 0.5 })) : { buyPrice: 0.5, sellPrice: 0.5 }
        ]);

        // Fetch fresh values from Polymarket APIs
        const [balanceRes, tradesRes, positionsRes] = await Promise.allSettled([
            polymarketRelayerService.getPusdBalance(user.wallet_index),
            polymarketService.getTradesForProxy(proxyAddress),
            polymarketService.getPositionsForProxy(proxyAddress).catch(() => [])
        ]);

        const balance = balanceRes.status === 'fulfilled' ? balanceRes.value : "0.00";
        const rawTrades = tradesRes.status === 'fulfilled' ? tradesRes.value : [];
        const positionsData = positionsRes.status === 'fulfilled' ? positionsRes.value : [];

        // Auto-claim background check disabled - using manual claim buttons instead

        // 1. Sync rawTrades from Polymarket to DB to ensure we don't miss anything that happened outside our app
        try {
            if (rawTrades && rawTrades.length > 0) {
                // Reconcile optimistic/duplicate/stale trades first
                await polymarketService.reconcileAndCleanupTrades(user.telegram_id, proxyAddress, rawTrades);

                const rows = rawTrades.map((t: any) => {
                    const assetLc = (t.asset_id || '').toLowerCase();
                    const rawOutcome = String(t.outcome || '').toUpperCase();
                    const outcome = (rawOutcome === 'YES' || rawOutcome === 'UP' || t.outcomeIndex === 0) ? 'UP' : 'DOWN';
                    const side = (t.side || 'BUY').toUpperCase();
                    const price = parseFloat(t.price ?? '0');
                    const shares = parseFloat(t.size ?? '0');
                    const cost = shares * price;

                    let tradedAt = new Date().toISOString();
                    if (t.create_time) tradedAt = new Date(t.create_time).toISOString();
                    else if (t.timestamp) {
                        const raw = t.timestamp.toString();
                        tradedAt = raw.includes('T') ? raw : new Date(parseInt(raw) * 1000).toISOString();
                    }

                    return {
                        user_id: user.id,
                        telegram_id: user.telegram_id,
                        username: user.username,
                        proxy_address: proxyAddress,
                        clob_trade_id: t.id ?? t.trade_id ?? t.transactionHash ?? crypto.createHash('md5').update(`${proxyAddress}-${t.conditionId || t.market}-${t.side}-${t.price}-${t.size}-${t.timestamp || t.create_time}`).digest('hex'),
                        condition_id: t.market ?? t.conditionId ?? '',
                        token_id: assetLc,
                        outcome,
                        side,
                        price,
                        shares,
                        cost_usdc: cost,
                        traded_at: tradedAt,
                    };
                }).filter((r: any) => r.condition_id && r.shares > 0);

                if (rows.length > 0) {
                    await db.getClient()
                        .from('prediction_trades')
                        .upsert(rows, { onConflict: 'clob_trade_id', ignoreDuplicates: true });
                    
                    // On-demand resolution check
                    const { resolvePredictionTrades } = await import("../jobs/resolvePredictionTrades");
                    await resolvePredictionTrades();
                }
            }
        } catch (dbSyncErr: any) {
            console.warn("[MINIAPP] Failed to sync raw trades to DB in snapshot:", dbSyncErr.message);
        }

        // 2. Use database as the source of truth for history (queried after sync & reconcile)
        const { data: dbTrades } = await db.getClient()
            .from('prediction_trades')
            .select('*')
            .eq('telegram_id', user.telegram_id)
            .order('traded_at', { ascending: false });

        // 3. Process positions & trades using database trades (so it includes fresh, unindexed trades)
        const yesTokenIdLc = market ? market.yesTokenId.toLowerCase() : "";
        const noTokenIdLc = market ? market.noTokenId.toLowerCase() : "";

        const positionMap: Record<string, { outcome: string; asset: string; title?: string; qty: number; totalCost: number; avgPrice: number; currentPrice: number | null }> = {};
        let activeRealizedPnl = 0;
        const sortedTrades = [...(dbTrades || [])].reverse();

        for (const trade of sortedTrades) {
            const tradeAssetLc = (trade.token_id || "").toLowerCase();
            const isUp = market ? tradeAssetLc === yesTokenIdLc : false;
            const isDown = market ? tradeAssetLc === noTokenIdLc : false;
            if (!isUp && !isDown) continue;

            const key = isUp ? "UP" : "DOWN";
            const qty = parseFloat(trade.shares ?? "0");
            const price = parseFloat(trade.price ?? "0");
            const isSell = trade.side === "SELL";

            if (!positionMap[key]) {
                positionMap[key] = {
                    outcome: isUp ? 'UP' : 'DOWN',
                    asset: tradeAssetLc,
                    title: trade.title || (isUp ? "Bitcoin Price > Strike" : "Bitcoin Price <= Strike"),
                    qty: 0,
                    totalCost: 0,
                    avgPrice: 0,
                    currentPrice: isUp ? yesPrice?.buyPrice ?? null : (isDown ? noPrice?.buyPrice ?? null : price),
                };
            }

            if (isSell) {
                const avgEntryPrice = positionMap[key].qty > 0 ? positionMap[key].totalCost / positionMap[key].qty : 0;
                activeRealizedPnl += (price - avgEntryPrice) * qty;
                positionMap[key].qty -= qty;
                positionMap[key].totalCost -= avgEntryPrice * qty;
            } else {
                positionMap[key].qty += qty;
                positionMap[key].totalCost += qty * price;
            }
        }

        // Sync qty with Data API
        for (const key of Object.keys(positionMap)) {
            if (!market) continue;
            const tokenIdLc = key === "UP" ? yesTokenIdLc : noTokenIdLc;
            const activePos = positionsData.find((p: any) => (p.asset || "").toLowerCase() === tokenIdLc);

            if (positionMap[key].qty > 0) {
                positionMap[key].avgPrice = positionMap[key].totalCost / positionMap[key].qty;
            }

            if (activePos && parseFloat(activePos.size) > 0 && !activePos.redeemable) {
                const syncedQty = parseFloat(activePos.size);
                // Only overwrite if the synced quantity from Polymarket is larger or if our trade-loop computed quantity is 0
                // (this protects against the positions API lagging behind the real-time trades API)
                if (syncedQty > positionMap[key].qty || positionMap[key].qty === 0) {
                    if (activePos.initialValue !== undefined) {
                        const initialValue = parseFloat(activePos.initialValue);
                        positionMap[key].qty = syncedQty;
                        positionMap[key].totalCost = initialValue;
                        positionMap[key].avgPrice = initialValue / syncedQty;
                    } else {
                        const oldQty = positionMap[key].qty;
                        if (oldQty > 0 && syncedQty !== oldQty) {
                            positionMap[key].totalCost = (positionMap[key].totalCost / oldQty) * syncedQty;
                        }
                        positionMap[key].qty = syncedQty;
                        positionMap[key].avgPrice = positionMap[key].qty > 0 ? positionMap[key].totalCost / positionMap[key].qty : 0;
                    }
                }
            } else if (activePos && activePos.redeemable) {
                positionMap[key].qty = 0;
            } else if (!activePos) {
                // Keep trade loop
            } else {
                positionMap[key].qty = 0;
            }
        }

        // Fallback: Ensure any active positions from Polymarket positionsData are added even if not present in positionMap
        for (const p of positionsData) {
            if (!market) continue;
            const assetLc = (p.asset || "").toLowerCase();
            const isYes = assetLc === yesTokenIdLc;
            const isNo = assetLc === noTokenIdLc;
            if (!isYes && !isNo) continue;

            const key = isYes ? "UP" : "DOWN";
            const syncedQty = parseFloat(p.size || "0");
            if (syncedQty > 0.001 && !p.redeemable) {
                if (!positionMap[key]) {
                    const initialValue = p.initialValue !== undefined ? parseFloat(p.initialValue) : 0;
                    positionMap[key] = {
                        outcome: isYes ? 'UP' : 'DOWN',
                        asset: assetLc,
                        title: p.title || (isYes ? "Bitcoin Price > Strike" : "Bitcoin Price <= Strike"),
                        qty: syncedQty,
                        totalCost: initialValue,
                        avgPrice: syncedQty > 0 ? initialValue / syncedQty : 0,
                        currentPrice: isYes ? yesPrice?.buyPrice ?? null : (isNo ? noPrice?.buyPrice ?? null : null),
                    };
                }
            }
        }

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
                    qty: parseFloat(p.qty.toFixed(6)),
                    avg: parseFloat(p.avgPrice.toFixed(2)),
                    currentPrice: parseFloat(effectivePrice.toFixed(2)),
                    value: parseFloat(value.toFixed(2)),
                    cost: parseFloat(cost.toFixed(2)),
                    returnAmt: parseFloat(returnAmt.toFixed(2)),
                    returnPct: parseFloat(returnPct.toFixed(2)),
                    title: p.title,
                };
            });

        const mappedTrades = (dbTrades || []).map((t: any) => ({
            id: t.clob_trade_id,
            side: t.side,
            outcome: t.outcome,
            conditionId: t.condition_id,
            qty: parseFloat(t.shares),
            price: parseFloat(t.price),
            cost: parseFloat(t.cost_usdc),
            timestamp: new Date(t.traded_at).getTime(),
            resolved: t.resolved,
            resolution: t.resolution,
            payout: t.payout_usdc ? parseFloat(t.payout_usdc) : 0,
            pnl: t.pnl_usdc ? parseFloat(t.pnl_usdc) : 0
        }));

        // Keep activeRealizedPnl for floating returns
        let realizedPnl = activeRealizedPnl;
        try {
            const { data: userStats } = await db.getClient()
                .from('prediction_user_stats')
                .select('realized_pnl')
                .eq('telegram_id', user.telegram_id)
                .single();
            
            if (userStats) {
                realizedPnl += parseFloat(userStats.realized_pnl || '0');
            }
        } catch (dbErr: any) {
            console.warn('[MINIAPP] Failed to fetch realized PNL from DB:', dbErr.message);
        }

        const recentTrades = mappedTrades.filter(t => market && t.conditionId === market.conditionId);

        // Auto-claiming is enabled — unclaimedWinnings is always 0
        const unclaimedWinnings = 0;

        const snapshotCache = {
            balance,
            positions,
            trades: mappedTrades.slice(0, 50),
            recentTrades: recentTrades.slice(0, 10),
            realizedPnl: parseFloat(realizedPnl.toFixed(2)),
            depositAddress: proxyAddress,
            unclaimedWinnings,
            marketSlug: market ? market.slug : null,
            timestamp: Date.now() // Add timestamp for throttling updates
        };

        await polymarketService.saveUserPredictionsCache(user.telegram_id, snapshotCache);
        return snapshotCache;
    } catch (err: any) {
        console.error("[Cache] Failed to refresh snapshot:", err.message);
        throw err;
    }
}

router.get("/predictions/snapshot", async (req: Request, res: Response) => {
    try {
        const targetTgId = req.query.telegramId ? Number(req.query.telegramId) : req.telegramUser!.id;
        const user = await db.getUserByTelegramId(targetTgId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index, (user as any).deposit_wallet_address);
        if (!proxyAddress) {
            return res.json({
                balance: "0.00",
                positions: [],
                trades: [],
                recentTrades: [],
                depositAddress: "",
                market: null,
                history: [],
                realizedPnl: 0,
                user: {
                    id: user.id,
                    telegram_id: user.telegram_id,
                    username: user.username,
                    first_name: user.first_name,
                    created_at: user.created_at,
                    wallet_address: ""
                }
            });
        }

        // Try reading user snapshot from predictions_cache (Supabase / Redis)
        const forceRefresh = req.query.refresh === 'true';
        const cached = forceRefresh ? null : await polymarketService.getUserPredictionsCache(user.telegram_id);

        // Resolve active market first (almost instant < 5ms due to cache)
        const market = await polymarketService.getActiveBtcMarket().catch(() => null);

        // Check if cache matches current market slug
        const isCacheValid = cached && market && cached.marketSlug === market.slug;

        // Fetch outcome prices, cached history, and current round open price in parallel
        const [[yesPrice, noPrice], parsedHistory, roundOpenPrice] = await Promise.all([
            Promise.all([
                market ? polymarketService.getOutcomePrice(market.yesTokenId, false).catch(() => ({ buyPrice: 0.5, sellPrice: 0.5 })) : { buyPrice: 0.5, sellPrice: 0.5 },
                market ? polymarketService.getOutcomePrice(market.noTokenId, true).catch(() => ({ buyPrice: 0.5, sellPrice: 0.5 })) : { buyPrice: 0.5, sellPrice: 0.5 }
            ]),
            getCachedBitcoinHistory(),
            getCurrentRoundOpenPrice(),
        ]);

        if (isCacheValid) {
            // Serve cached predictions instantly, trigger background refresh only if cache is older than 15 seconds
            const cacheAge = Date.now() - (cached.timestamp || 0);
            if (cacheAge > 15000) {
                console.log(`[Cache] Cache age is ${cacheAge}ms (> 15s). Triggering background refresh for user ${user.telegram_id}`);
                refreshUserSnapshotCache(user, proxyAddress).catch(() => {});
            } else {
                console.log(`[Cache] Cache age is ${cacheAge}ms (<= 15s). Skipping background refresh for user ${user.telegram_id}`);
            }

            return res.json({
                balance: cached.balance,
                positions: cached.positions || [],
                trades: cached.trades || [],
                recentTrades: cached.recentTrades || [],
                depositAddress: cached.depositAddress || proxyAddress,
                market: market ? {
                    ...market,
                    yesPrice,
                    noPrice,
                    openPrice: roundOpenPrice,
                } : null,
                history: parsedHistory,
                realizedPnl: cached.realizedPnl || 0,
                unclaimedWinnings: cached.unclaimedWinnings || 0,
                user: {
                    id: user.id,
                    telegram_id: user.telegram_id,
                    username: user.username,
                    first_name: user.first_name,
                    created_at: user.created_at,
                    wallet_address: cached.depositAddress || proxyAddress
                }
            });
        }

        // No cache: fetch and process synchronously so they get correct data on first load
        const fresh = await refreshUserSnapshotCache(user, proxyAddress);
        res.json({
            balance: fresh.balance,
            positions: fresh.positions,
            trades: fresh.trades,
            recentTrades: fresh.recentTrades,
            depositAddress: fresh.depositAddress,
            market: market ? {
                ...market,
                yesPrice,
                noPrice,
                openPrice: roundOpenPrice,
            } : null,
            history: parsedHistory,
            realizedPnl: fresh.realizedPnl,
            unclaimedWinnings: fresh.unclaimedWinnings || 0,
            user: {
                id: user.id,
                telegram_id: user.telegram_id,
                username: user.username,
                first_name: user.first_name,
                created_at: user.created_at,
                wallet_address: fresh.depositAddress || proxyAddress
            }
        });
    } catch (err: any) {
        console.error("[MINIAPP] Snapshot endpoint error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.get("/predictions/trades", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const targetConditionId = req.query.conditionId as string;
        const wantAll = req.query.all === 'true';

        let query = db.getClient()
            .from("prediction_trades")
            .select("*")
            .eq("user_id", user.id)
            .order("traded_at", { ascending: false });

        if (targetConditionId) {
            query = query.eq("condition_id", targetConditionId);
        } else if (!wantAll) {
            const market = await polymarketService.getActiveBtcMarket().catch(() => null);
            if (market) {
                query = query.eq("condition_id", market.conditionId);
            }
        }

        let { data, error } = await query.limit(100);
        if (error) throw error;

        // On-demand resolution check if there are unresolved trades for this user
        const hasUnresolved = (data || []).some((t: any) => !t.resolved && t.side === 'BUY');
        if (hasUnresolved) {
            try {
                console.log(`[MINIAPP] Unresolved trades detected for user ${user.id}. Running on-demand resolution...`);
                const { resolvePredictionTrades } = await import("../jobs/resolvePredictionTrades");
                await resolvePredictionTrades();
                
                // Re-fetch to get updated resolved state
                const refetch = await query.limit(100);
                if (!refetch.error && refetch.data) {
                    data = refetch.data;
                }
            } catch (err: any) {
                console.warn("[MINIAPP] On-demand resolution check failed:", err.message);
            }
        }

        const mappedTrades = (data || []).map((t: any) => ({
            id: t.id,
            side: t.side,
            outcome: t.outcome,
            price: parseFloat(t.price),
            qty: parseFloat(t.shares),
            cost: parseFloat(t.cost_usdc),
            timestamp: new Date(t.traded_at).getTime(),
            conditionId: t.condition_id,
            resolved: t.resolved,
            resolution: t.resolution,
            claimed: t.claimed,
            claimTxHash: t.claim_tx_hash,
            payoutUsdc: t.payout_usdc ? parseFloat(t.payout_usdc) : 0,
            pnlUsdc: t.pnl_usdc ? parseFloat(t.pnl_usdc) : 0,
        }));

        return res.json({ trades: mappedTrades });
    } catch (err: any) {
        console.error("[MINIAPP] Error in predictions/trades:", err.message);
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
        
        const uniqueConditions = new Map<string, number>();
        
        if (req.body.conditionId) {
            let indexSet = req.body.indexSet;
            if (!indexSet && req.body.outcomeIndex !== undefined) {
                const outcomeIndex = typeof req.body.outcomeIndex === 'string' ? parseInt(req.body.outcomeIndex) : req.body.outcomeIndex;
                indexSet = outcomeIndex === 0 ? 1 : 2;
            }
            if (!indexSet) {
                const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index);
                const positions = await polymarketService.getPositionsForProxy(proxyAddress);
                const pos = positions.find((p: any) => p.conditionId === req.body.conditionId);
                if (pos) {
                    const outcomeIndex = typeof pos.outcomeIndex === 'string' ? parseInt(pos.outcomeIndex) : pos.outcomeIndex;
                    indexSet = outcomeIndex === 0 ? 1 : 2;
                }
            }
            if (!indexSet) {
                const { data: dbTrade } = await db.getClient()
                    .from("prediction_trades")
                    .select("outcome")
                    .eq("user_id", user.id)
                    .eq("condition_id", req.body.conditionId)
                    .limit(1)
                    .maybeSingle();
                if (dbTrade) {
                    indexSet = dbTrade.outcome === "UP" ? 1 : 2;
                }
            }
            if (!indexSet) {
                return res.status(400).json({ error: "Cannot determine indexSet for claim. Please provide outcomeIndex or conditionId with known positions." });
            }
            uniqueConditions.set(req.body.conditionId, indexSet);
        } else {
            const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index);
            const positions = await polymarketService.getPositionsForProxy(proxyAddress);
            for (const p of positions) {
                if (p.redeemable && p.size > 0 && p.conditionId) {
                    const outcomeIndex = typeof p.outcomeIndex === 'string' ? parseInt(p.outcomeIndex) : p.outcomeIndex;
                    const indexSet = outcomeIndex === 0 ? 1 : 2;
                    uniqueConditions.set(p.conditionId, indexSet);
                }
            }
        }
        
        let claimedCount = 0;
        for (const [conditionId, indexSet] of uniqueConditions.entries()) {
            try {
                const txHash = await polymarketRelayerService.redeemPositions(user.wallet_index, conditionId, indexSet);
                claimedCount++;
                
                // Update trade claim state in DB
                try {
                    await db.getClient()
                        .from('prediction_trades')
                        .update({
                            claimed: true,
                            claim_tx_hash: txHash || null
                        })
                        .eq('user_id', user.id)
                        .eq('condition_id', conditionId);
                } catch (dbErr: any) {
                    console.warn(`[AutoClaim] DB update failed for claimed condition ${conditionId}:`, dbErr.message);
                }
            } catch (e: any) {
                // Expected if already claimed, or lost, or market not resolved yet
                console.error("[AutoClaim] Manual redeem failed for condition", conditionId, ":", e.message);
            }
        }
        
        if (claimedCount > 0) {
            try {
                await polymarketService.clearUserPredictionsCache(user.telegram_id);
                const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index, (user as any).deposit_wallet_address).catch(() => null);
                if (proxyAddress) {
                    polymarketService.clearUserCache(proxyAddress);
                }
            } catch (cacheErr: any) {
                console.warn("[AutoClaim] Failed to clear caches:", cacheErr.message);
            }
        }
        
        res.json({ success: true, claimed: claimedCount });
    } catch (err: any) {
        console.error('[AutoClaim] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.get("/predictions/my-stats", async (req: Request, res: Response) => {
    try {
        const telegramUser = (req as any).telegramUser;
        if (!telegramUser) return res.status(401).json({ error: "Unauthorized" });

        const user = await db.getUserByTelegramId(telegramUser.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        let { data, error } = await db.getClient()
            .from("prediction_user_stats")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            // New user/trader logic: try to resolve proxy address and insert a stats row so it can be synced
            const proxyAddress = await polymarketRelayerService.resolveDepositWallet(
                user.wallet_index,
                (user as any).deposit_wallet_address
            ).catch(() => null);

            if (proxyAddress) {
                const supabase = db.getClient();
                const newRow = {
                    user_id: user.id,
                    telegram_id: Number(user.telegram_id),
                    username: user.username || null,
                    proxy_address: proxyAddress,
                    total_trades: 0,
                    total_wins: 0,
                    total_losses: 0,
                    total_wagered: 0,
                    total_payout: 0,
                    realized_pnl: 0,
                    pending_claims: 0,
                    updated_at: new Date().toISOString()
                };

                const { data: inserted, error: insertErr } = await supabase
                    .from("prediction_user_stats")
                    .insert(newRow)
                    .select()
                    .maybeSingle();

                if (!insertErr && inserted) {
                    data = inserted;
                } else if (insertErr) {
                    console.error("[MINIAPP] Failed to insert prediction_user_stats:", insertErr.message);
                }
            }
        }

        if (data) {
            // Trigger background sync for this user to ensure stats are fresh on next load
            if (data.proxy_address) {
                import("../jobs/resolvePredictionTrades").then(({ syncSingleUserStatsFromPolymarket }) => {
                    syncSingleUserStatsFromPolymarket(user.id, Number(user.telegram_id), data.proxy_address).catch(() => {});
                }).catch(() => {});
            }
            return res.json(data);
        }

        // Fallback for new user with no proxy address yet
        return res.json({
            total_trades: 0,
            total_wins: 0,
            total_losses: 0,
            total_wagered: 0,
            total_payout: 0,
            realized_pnl: 0,
            pending_claims: 0
        });
    } catch (err: any) {
        console.error("[MINIAPP] Error in my-stats:", err.message);
        res.status(500).json({ error: err.message });
    }
});

router.get("/referrals/claim-signature", validateInitData, async (req: Request, res: Response) => {
    try {
        const tgUser = req.telegramUser;

        if (!tgUser) {
            return res.status(400).json({ error: "Missing user" });
        }

        // Always use the bot (custodial) wallet for reward claims — ignore any
        // address passed by the frontend so external-wallet users cannot redirect
        // rewards to their own address.
        const user = await db.getUserByTelegramId(tgUser.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const derived = wallet.deriveWallet(user.wallet_index);
        const botAddress = derived.address;

        // 1. Get total qualified invites
        const supabaseClient = db.getClient();
        const { count: qualified_invites } = await supabaseClient
            .from("referrals")
            .select("*", { count: "exact", head: true })
            .eq("referrer_telegram_id", tgUser.id)
            .eq("status", "completed");

        const totalQualifiedInvites = qualified_invites || 0;

        // 2. Generate EIP-712 Signature
        // The contract expects: ClaimReward(address user,uint256 totalQualifiedInvites)
        const REWARD_CONTRACT_ADDRESS = process.env.REWARD_CONTRACT_ADDRESS || "0x7B56349B3195050Dd817275CAF083fDE2C70239C"; // Proxy address
        const domain = {
            name: "P2PFatherReferrals",
            version: "1",
            chainId: 8453, // Base Mainnet
            verifyingContract: REWARD_CONTRACT_ADDRESS
        };

        const types = {
            ClaimReward: [
                { name: "user", type: "address" },
                { name: "totalQualifiedInvites", type: "uint256" }
            ]
        };

        const value = {
            user: botAddress,  // Always the bot wallet — never the external address
            totalQualifiedInvites: totalQualifiedInvites
        };

        const { ethers } = require("ethers");
        const signer = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY!);
        
        const signature = await signer.signTypedData(domain, types, value);

        res.json({
            success: true,
            contractAddress: REWARD_CONTRACT_ADDRESS,
            totalQualifiedInvites,
            signature
        });
    } catch (err: any) {
        console.error("[MINIAPP] Error generating claim signature:", err.message);
        res.status(500).json({ error: err.message });
    }
});

export { router as miniappRouter };



