

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
import { ethers } from "ethers";
import axios from "axios";
import { bot } from "../bot";
import { redis } from "../services/redis";
import { feeCashbackService } from "../services/feeCashbackService";
import { IpTrackerService } from "../services/ip-tracker";
import { checkRateLimit } from "../services/rateLimiter";

// Multer for in-memory file uploads (max 5MB)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Supabase client for storage
const supabaseStorage = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const router = Router();

// 🛡️ Global IP Guard: Block Scammer IPs from MiniApp Access
router.use((req: Request, res: Response, next: NextFunction) => {
    const clientIp = IpTrackerService.getClientIp(req);
    if (IpTrackerService.isIpBlocked(clientIp)) {
        console.warn(`[IP-GUARD] ⛔ Access blocked for scammer IP: ${clientIp} on ${req.method} ${req.url}`);
        return res.status(403).json({ error: "Access denied. Your IP address has been blocked due to security violations." });
    }
    next();
});

// ── Web Trade Room Token Helper (HMAC-SHA256) ──────────────────────────
const TRADE_TOKEN_SECRET = process.env.JWT_SECRET || env.TELEGRAM_BOT_TOKEN || "p2pfather_trade_secret_key";

// ── WhatsApp Web Auth Token Secret (HMAC-SHA256 signed, Bug #1 fix) ─────
const WA_AUTH_SECRET = process.env.WA_AUTH_SECRET || env.TELEGRAM_BOT_TOKEN + "_wa_web_auth";

/** Generate a signed WA web-auth token (replaces plain 'wa_auth' magic string) */
export function generateWaAuthToken(tgUserObj: object, authDate: number): string {
    const payload = JSON.stringify(tgUserObj) + ":" + authDate;
    const sig = crypto.createHmac("sha256", WA_AUTH_SECRET).update(payload).digest("hex");
    return `wa_signed_${sig}`;
}

/** Verify a signed WA web-auth token — returns true only if signature matches */
export function verifyWaAuthToken(tgUserObj: object, authDate: number, token: string): boolean {
    if (!token || !token.startsWith("wa_signed_")) return false;
    const sig = token.slice("wa_signed_".length);
    const payload = JSON.stringify(tgUserObj) + ":" + authDate;
    const expectedSig = crypto.createHmac("sha256", WA_AUTH_SECRET).update(payload).digest("hex");
    try {
        return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"));
    } catch { return false; }
}

// ── Distributed Redis-backed rate limiter (imported from rateLimiter.ts) ────
// checkRateLimit is async and uses Redis INCR/EXPIRE for distributed correctness.
// Falls back to in-process Map automatically if Redis is unavailable.

export function generateTradeToken(tradeId: string, userId: string): string {
    const exp = Date.now() + 7 * 24 * 3600 * 1000; // 7 days valid duration
    const payload = `${tradeId}:${userId}:${exp}`;
    const hmac = crypto.createHmac("sha256", TRADE_TOKEN_SECRET).update(payload).digest("hex");
    return Buffer.from(JSON.stringify({ tradeId, userId, exp, sig: hmac })).toString("base64url");
}

export function verifyTradeToken(token: string): { tradeId: string; userId: string } | null {
    try {
        const json = Buffer.from(token, "base64url").toString("utf8");
        const { tradeId, userId, exp, sig } = JSON.parse(json);
        if (!tradeId || !userId || !exp || !sig) return null;
        if (Date.now() > exp) return null;

        const payload = `${tradeId}:${userId}:${exp}`;
        const expectedSig = crypto.createHmac("sha256", TRADE_TOKEN_SECRET).update(payload).digest("hex");
        if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
            return { tradeId, userId };
        }
    } catch (_) {}
    return null;
}

export function getTradeWebUrl(tradeId: string, userId: string): string {
    const token = generateTradeToken(tradeId, userId);
    return `https://p2pfather.com/trade/${tradeId}?token=${token}`;
}

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
        if (!user) return;
        if (user.telegram_id) {
            try {
                await bot.api.sendMessage(user.telegram_id, message, { parse_mode: "HTML" });
            } catch (tgErr) {
                console.error("[NOTIFY] TG send failed:", tgErr);
            }
        }
        if (user.whatsapp_phone) {
            try {
                const { hypermeowClient } = await import("../whatsapp/hypermeowClient");
                const cleanText = message.replace(/<[^>]+>/g, "").trim();
                await hypermeowClient.sendText(`${user.whatsapp_phone}@s.whatsapp.net`, cleanText);
            } catch (waErr) {
                console.error("[NOTIFY] WA send failed:", waErr);
            }
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
        if (env.NODE_ENV === "development" || process.env.NODE_ENV !== "production") {
            // Local Dev Mode Fallback User
            req.telegramUser = { id: 12345, first_name: "Developer", username: "dev_user" };
            console.log(`[MINIAPP-AUTH] 🟢 [DEV] Bypassing initData check for dev user 12345`);
            return next();
        }
        console.warn(`[MINIAPP-AUTH] ❌ Missing x-telegram-init-data header on ${req.method} ${req.url}`);
        return res.status(401).json({ error: "Please open this app through the Telegram bot" });
    }

    try {
        const params = new URLSearchParams(initData);
        const hash = params.get("hash");
        params.delete("hash");

        // WhatsApp Web Auth — HMAC-signed token (Bug #1 fix)
        // Old magic_link_auth/wa_auth bypass removed — must be properly signed now
        if (hash && hash.startsWith("wa_signed_")) {
            const userStr = params.get("user");
            const authDate = parseInt(params.get("auth_date") || "0");
            if (userStr && authDate) {
                let parsedUser: any;
                try { parsedUser = JSON.parse(userStr); } catch { /* fall through to 401 */ }
                if (parsedUser && verifyWaAuthToken(parsedUser, authDate, hash)) {
                    // Token age check: reject if older than 30 days
                    const now = Math.floor(Date.now() / 1000);
                    if (now - authDate > 30 * 86400) {
                        console.warn(`[MINIAPP-AUTH] ❌ WA signed token expired for user ${parsedUser?.id}`);
                        return res.status(401).json({ error: "Session expired. Please log in again." });
                    }
                    req.telegramUser = parsedUser;
                    console.log(`[MINIAPP-AUTH] 🟢 WA signed token OK for user: ${parsedUser.id}`);
                    return next();
                }
            }
            console.warn(`[MINIAPP-AUTH] ❌ Invalid WA signed token on ${req.method} ${req.url}`);
            return res.status(401).json({ error: "Invalid or tampered session. Please log in again." });
        }

        // Reject old unsigned magic strings — no longer accepted
        if (hash === "magic_link_auth" || hash === "wa_auth") {
            console.warn(`[MINIAPP-AUTH] ❌ Rejected legacy unsigned WA auth token on ${req.method} ${req.url}`);
            return res.status(401).json({ error: "Session expired. Please log in again." });
        }

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
            console.warn(`[MINIAPP-AUTH] ❌ Hash validation failed for req: ${req.method} ${req.url}`);
            return res.status(401).json({ error: "Invalid init data hash" });
        }

        const userStr = params.get("user");
        if (userStr) {
            req.telegramUser = JSON.parse(userStr);
        }

        if (!req.telegramUser) {
            console.warn(`[MINIAPP-AUTH] ❌ User object missing in initData`);
            return res.status(401).json({ error: "User data missing from init data" });
        }

        const authDate = parseInt(params.get("auth_date") || "0");
        const now = Math.floor(Date.now() / 1000);
        if (now - authDate > 86400 && env.NODE_ENV !== "development") {
            console.warn(`[MINIAPP-AUTH] ❌ InitData expired for user ${req.telegramUser.id} (age=${now - authDate}s)`);
            return res.status(401).json({ error: "Auth data expired" });
        }

        console.log(`[MINIAPP-AUTH] 🟢 Authenticated user: ${req.telegramUser.id} (@${req.telegramUser.username || "no_username"}) on ${req.method} ${req.url}`);

        // Async IP logging for multi-account tracking & admin dashboard
        db.getUserByTelegramId(req.telegramUser.id).then(u => {
            if (u) IpTrackerService.logIp(u.id, req);
        }).catch(() => {});

        next();
    } catch (err: any) {
        console.error(`[MINIAPP-AUTH] 💥 Exception during initData validation on ${req.method} ${req.url}:`, err.message);
        return res.status(401).json({ error: "Authentication failed" });
    }
}

// Public Routes

// Check if a WhatsApp phone is already registered with an active wallet (no OTP sent — purely a lookup)
// Bug #9 fix: Rate limited to prevent phone enumeration abuse (max 10 checks per IP per minute)
router.post("/auth/wa-check-user", async (req: Request, res: Response) => {
    try {
        // Rate limit: 10 requests per IP per minute (60 second window)
        const clientIp = IpTrackerService.getClientIp(req);
        if (!await checkRateLimit(`check:${clientIp}`, 10, 60)) {
            return res.status(429).json({ error: "Too many requests. Please wait a moment." });
        }

        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ error: "Phone number is required" });
        }
        const { waOtpService } = await import("../services/wa-otp");
        const cleanPhone = waOtpService.cleanPhone(phone);
        const user = await db.getUserByWhatsappPhone(cleanPhone);
        const exists = !!(user && user.wallet_address);
        return res.json({ exists, phone: cleanPhone });
    } catch (err: any) {
        console.error("[MINIAPP-AUTH] wa-check-user error:", err);
        return res.status(500).json({ error: err?.message || "Check failed" });
    }
});

// Bug #2 fix: Rate limited — max 3 OTP requests per phone per 10 minutes, max 5 per IP per 10 min
router.post("/auth/wa-request-otp", async (req: Request, res: Response) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ error: "Phone number is required" });
        }

        const { waOtpService } = await import("../services/wa-otp");
        const cleanPhone = waOtpService.cleanPhone(phone);
        const clientIp = IpTrackerService.getClientIp(req);

        // Rate limit per phone: 3 OTPs per 10 minutes (600 second window)
        if (!await checkRateLimit(`otp_phone:${cleanPhone}`, 3, 600)) {
            console.warn(`[MINIAPP-AUTH] OTP rate limit hit for phone: ${cleanPhone}`);
            return res.status(429).json({ error: "Too many OTP requests for this number. Please wait 10 minutes." });
        }
        // Rate limit per IP: 5 OTPs per 10 minutes (600 second window)
        if (!await checkRateLimit(`otp_ip:${clientIp}`, 5, 600)) {
            console.warn(`[MINIAPP-AUTH] OTP rate limit hit for IP: ${clientIp}`);
            return res.status(429).json({ error: "Too many OTP requests. Please wait a moment." });
        }

        const result = await waOtpService.sendOtp(phone);
        if (!result.success) {
            return res.status(400).json({ error: result.message });
        }

        return res.json({
            success: true,
            message: result.message,
            expiresMinutes: result.expiresMinutes
        });
    } catch (err: any) {
        console.error("[MINIAPP-AUTH] wa-request-otp error:", err);
        return res.status(500).json({ error: err?.message || "Failed to send OTP" });
    }
});

router.post("/auth/wa-verify-otp", async (req: Request, res: Response) => {
    try {
        const { phone, otp, name, first_name } = req.body;
        if (!phone || !otp) {
            return res.status(400).json({ error: "Phone number and OTP code are required" });
        }

        const { waOtpService } = await import("../services/wa-otp");
        const verifyResult = waOtpService.verifyOtp(phone, otp);
        if (!verifyResult.valid) {
            return res.status(400).json({ error: verifyResult.message });
        }

        const cleanPhone = waOtpService.cleanPhone(phone);
        let user = await db.getUserByWhatsappPhone(cleanPhone);
        if (!user) {
            user = await db.getOrCreateUserByPhone(cleanPhone);
        }

        let providedName = (first_name || name || "").trim();

        // Automatically fetch contact pushName from Hypermeow bridge if user name is unconfigured
        if (!providedName && (!user.first_name || /^WA_\d+$/.test(user.first_name))) {
            try {
                const { hypermeowClient } = await import("../whatsapp/hypermeowClient");
                if (hypermeowClient.isConfigured()) {
                    const fetchedName = await hypermeowClient.getContactName(cleanPhone);
                    if (fetchedName) providedName = fetchedName;
                }
            } catch (_) {}
        }

        if (providedName) {
            try {
                await db.updateUser(user.id, { first_name: providedName } as any);
                user.first_name = providedName;
            } catch (_) {}
        }

        // Construct wa_auth initData string
        // Filter out synthetic WA_XXXX default names — use only real stored names
        const realName = (user.first_name && !/^WA_\d+$/.test(user.first_name))
            ? user.first_name
            : null;

        if (user.telegram_id === null || user.telegram_id === undefined) {
            const syntheticTelegramId = -Math.abs(Math.floor((Date.now() % 10000000) * 100) + Math.floor(Math.random() * 100));
            await db.getClient().from("users").update({ telegram_id: syntheticTelegramId }).eq("id", user.id);
            user.telegram_id = syntheticTelegramId;
        }

        const tgUserObj = {
            id: user.telegram_id,
            first_name: realName || user.username || "WhatsApp User",
            username: user.username || `wa_${cleanPhone.slice(-4)}`,
            is_wa_user: true,
            whatsapp_phone: cleanPhone
        };
        // Bug #1 fix: Sign the token with HMAC instead of using plain 'wa_auth' magic string
        const authDate = Math.floor(Date.now() / 1000);
        const signedHash = generateWaAuthToken(tgUserObj, authDate);

        const params = new URLSearchParams();
        params.set("user", JSON.stringify(tgUserObj));
        params.set("auth_date", authDate.toString());
        params.set("hash", signedHash);

        const initData = params.toString();

        return res.json({
            success: true,
            initData,
            user: { ...user, first_name: realName || user.username || null }
        });

    } catch (err: any) {
        console.error("[MINIAPP-AUTH] wa-verify-otp error:", err);
        return res.status(500).json({ error: err?.message || "OTP verification failed" });
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

        // If user has no wallet yet, derive one safely
        if (!user.wallet_address && ((user as any).wallet_type === 'bot' || !(user as any).wallet_type)) {
            try {
                let walletIndex = user.wallet_index;
                if (walletIndex === undefined || walletIndex === null || walletIndex < 0) {
                    walletIndex = await db.getNextWalletIndex();
                }
                const derived = wallet.deriveWallet(walletIndex);
                await db.updateUser(user.id, {
                    wallet_index: walletIndex,
                    wallet_address: derived.address,
                    wallet_type: 'bot',
                } as any);
                user.wallet_index = walletIndex;
                user.wallet_address = derived.address;
                (user as any).wallet_type = 'bot';
                console.log(`[AUTH] Derived bot wallet for user ${user.id}: ${derived.address} (index=${walletIndex})`);
            } catch (walletErr: any) {
                console.error("[AUTH] Failed to derive wallet:", walletErr);
            }
        }

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

// ── GET /auth/me & /profile (Fresh Profile lookup for polling & sync) ───
router.get(["/auth/me", "/profile"], async (req: Request, res: Response) => {
    try {
        const tgUser = req.telegramUser;
        if (!tgUser) return res.status(401).json({ error: "Unauthorized" });

        const tgAny = tgUser as any;
        let user: any = null;
        if (tgAny.whatsapp_phone) user = await db.getUserByWhatsappPhone(tgAny.whatsapp_phone);
        if (!user && tgUser.id) user = await db.getUserByTelegramId(tgUser.id);
        if (!user && tgAny.id) user = await db.getUserById(tgAny.id);
        if (!user) user = await db.getOrCreateUser(tgUser as any);

        if (!user) return res.status(404).json({ error: "User not found" });

        return res.json({ user });
    } catch (err: any) {
        console.error("[MINIAPP] /auth/me error:", err);
        return res.status(500).json({ error: err.message });
    }
});

// ── Web Trade Token Auth (Magic link for Web Trade Room) ─────────────────
router.post("/auth/trade-token", async (req: Request, res: Response) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ error: "Token required" });

        const verified = verifyTradeToken(token);
        if (!verified) {
            return res.status(401).json({ error: "Invalid or expired trade link token" });
        }

        const { tradeId, userId } = verified;
        const supabase = db.getClient();
        
        // Fetch user profile
        const { data: user, error: userErr } = await supabase
            .from("users")
            .select("*")
            .eq("id", userId)
            .single();

        if (userErr || !user) {
            return res.status(404).json({ error: "User not found" });
        }

        const sessionPayload = {
            id: Number(user.telegram_id) || 0,
            username: user.username || "",
            first_name: user.first_name || "Trader"
        };
        const syntheticInitData = `user=${encodeURIComponent(JSON.stringify(sessionPayload))}&hash=magic_link_auth`;

        res.json({
            success: true,
            initData: syntheticInitData,
            tradeId,
            user: {
                ...user,
                is_admin: env.ADMIN_IDS.includes(Number(user.telegram_id)),
                admin_ids: env.ADMIN_IDS
            }
        });
    } catch (err: any) {
        console.error("[AUTH-TRADE-TOKEN] Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  WALLET — Balances, Send, Connect
// ═══════════════════════════════════════════════════════════════

router.get("/wallet/balances", async (req: Request, res: Response) => {
    try {
        const tgUser = req.telegramUser;
        if (!tgUser) return res.status(401).json({ error: "Unauthorized" });

        const tgAny = tgUser as any;
        let user: any = null;
        if (tgAny.whatsapp_phone) user = await db.getUserByWhatsappPhone(tgAny.whatsapp_phone);
        if (!user && tgUser.id) user = await db.getUserByTelegramId(tgUser.id);
        if (!user && tgAny.id) user = await db.getUserById(tgAny.id);

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
            vaultBaseUsdc, vaultBscUsdc, vaultBaseUsdt, vaultBscUsdt, vaultBscBnb, vaultTestnetUsdt,
            reservedBaseUsdc, reservedBscUsdc, reservedBaseUsdt, reservedBscUsdt, reservedBscBnb, reservedTestnetUsdt
        ] = await Promise.all([
            wallet.getBalances(user.wallet_address),
            escrow.getVaultBalance(user.wallet_address, env.USDC_ADDRESS, 'base').catch(() => "0.0"),
            escrow.getVaultBalance(user.wallet_address, "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", 'bsc').catch(() => "0.0"),
            escrow.getVaultBalance(user.wallet_address, env.USDT_ADDRESS, 'base').catch(() => "0.0"),
            escrow.getVaultBalance(user.wallet_address, "0x55d398326f99059fF775485246999027B3197955", 'bsc').catch(() => "0.0"),
            escrow.getVaultBalance(user.wallet_address, "0x0000000000000000000000000000000000000000", 'bsc').catch(() => "0.0"),
            escrow.getVaultBalance(user.wallet_address, "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd", 'bsc_testnet' as any).catch(() => "0.0"),
            db.getReservedAmount(user.id, 'USDC', 'base').catch(() => 0),
            db.getReservedAmount(user.id, 'USDC', 'bsc').catch(() => 0),
            db.getReservedAmount(user.id, 'USDT', 'base').catch(() => 0),
            db.getReservedAmount(user.id, 'USDT', 'bsc').catch(() => 0),
            db.getReservedAmount(user.id, 'BNB', 'bsc').catch(() => 0),
            db.getReservedAmount(user.id, 'USDT', 'bsc_testnet').catch(() => 0)
        ]);

        res.json({
            ...balances,
            vault_base_usdc: vaultBaseUsdc,
            vault_bsc_usdc: vaultBscUsdc,
            vault_base_usdt: vaultBaseUsdt,
            vault_bsc_usdt: vaultBscUsdt,
            vault_bsc_bnb: vaultBscBnb,
            vault_testnet_usdt: vaultTestnetUsdt,
            vault_base_reserved: (reservedBaseUsdc + reservedBaseUsdt).toString(),
            vault_bsc_reserved: (reservedBscUsdc + reservedBscUsdt + reservedBscBnb).toString(),
            vault_testnet_reserved: reservedTestnetUsdt.toString(),

            // Detailed reserved breakdown for UI
            reserved_base_usdc: reservedBaseUsdc.toString(),
            reserved_base_usdt: reservedBaseUsdt.toString(),
            reserved_bsc_usdc: reservedBscUsdc.toString(),
            reserved_bsc_usdt: reservedBscUsdt.toString(),
            reserved_bsc_bnb: reservedBscBnb.toString(),
            reserved_testnet_usdt: reservedTestnetUsdt.toString(),

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
        } as any);

        res.json({ success: true });
    } catch (err: any) {
        console.error("[MINIAPP] Connect error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/wallet/bot", async (req: Request, res: Response) => {
    try {
        console.log(`[MINIAPP-WALLET] 📥 /wallet/bot requested by Telegram user: ${req.telegramUser?.id}`);
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) {
            console.warn(`[MINIAPP-WALLET] ❌ /wallet/bot user not found for Telegram ID: ${req.telegramUser?.id}`);
            return res.status(404).json({ error: "User not found" });
        }

        let walletIndex = user.wallet_index;
        if (walletIndex === undefined || walletIndex === null || walletIndex < 0) {
            walletIndex = await db.getNextWalletIndex();
            console.log(`[MINIAPP-WALLET] ℹ️ Auto-assigned new wallet index: ${walletIndex} for user ${user.id}`);
        }

        const derived = wallet.deriveWallet(walletIndex);

        await db.updateUser(user.id, {
            wallet_index: walletIndex,
            wallet_address: derived.address,
            wallet_type: 'bot',
        } as any);

        console.log(`[MINIAPP-WALLET] 🟢 Successfully set Bot Wallet ${derived.address} (index=${walletIndex}) for user ${user.id}`);
        res.json({ success: true, address: derived.address });
    } catch (err: any) {
        console.error("[MINIAPP-WALLET] 💥 Switch to bot error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/wallet/switch-bot", async (req: Request, res: Response) => {
    try {
        const tgUser = req.telegramUser;
        if (!tgUser) return res.status(401).json({ error: "Unauthorized" });

        const tgAny = tgUser as any;
        let user: any = null;
        if (tgAny.whatsapp_phone) user = await db.getUserByWhatsappPhone(tgAny.whatsapp_phone);
        if (!user && tgUser.id) user = await db.getUserByTelegramId(tgUser.id);
        if (!user && tgAny.id) user = await db.getUserById(tgAny.id);

        if (!user) return res.status(404).json({ error: "User not found" });

        const { target } = req.body; // 'telegram' | 'whatsapp'
        if (!target || !['telegram', 'whatsapp'].includes(target)) {
            return res.status(400).json({ error: "Target must be 'telegram' or 'whatsapp'" });
        }

        const cache = user.predictions_cache || {};
        const linkedWallets = cache.linked_wallets || {};
        const targetWallet = linkedWallets[target];

        if (!targetWallet || targetWallet.wallet_index === undefined) {
            return res.status(400).json({ error: `No linked ${target} wallet found` });
        }

        const derived = wallet.deriveWallet(targetWallet.wallet_index);

        await db.updateUser(user.id, {
            wallet_index: targetWallet.wallet_index,
            wallet_address: derived.address,
            wallet_type: 'bot',
        } as any);

        console.log(`[MINIAPP-WALLET] 🔄 Switched active bot wallet to ${target} (${derived.address}, index=${targetWallet.wallet_index}) for user ${user.id}`);
        res.json({ success: true, target, address: derived.address, wallet_index: targetWallet.wallet_index });
    } catch (err: any) {
        console.error("[MINIAPP-WALLET] Switch bot error:", err);
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

        // Instantly cancel any sell ads that are now under-funded due to this withdrawal.
        // Fire-and-forget — don't block the HTTP response.
        import("../services/jobs").then(({ cancelUnderfundedAds }) => {
            cancelUnderfundedAds(user.id, user.wallet_address!, token, targetChain, escrow).catch(console.error);
        }).catch(console.error);

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
                }
            }
        }

        // Attach trader average completion time to orders
        const ordersWithAvgTime = await Promise.all(
            orders.map(async o => {
                let avgMinutes: number | null = null;
                if (o.user_id) {
                    avgMinutes = await db.getUserAvgCompletionMinutes(o.user_id);
                }
                return {
                    ...o,
                    avg_completion_minutes: avgMinutes
                };
            })
        );

        res.json({ orders: ordersWithAvgTime });
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
        const tgUser = req.telegramUser;
        if (!tgUser) return res.status(401).json({ error: "Unauthorized" });

        const tgAny = tgUser as any;
        let user: any = null;
        if (tgAny.whatsapp_phone) user = await db.getUserByWhatsappPhone(tgAny.whatsapp_phone);
        if (!user && tgUser.id) user = await db.getUserByTelegramId(tgUser.id);
        if (!user && tgAny.id) user = await db.getUserById(tgAny.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        if (user.is_banned) {
            return res.status(403).json({
                error: "⛔ Your account has been restricted from trading. Please contact support for assistance."
            });
        }

        // Require at least one payment method set up
        if (!user.upi_id && !user.phone_number && !user.bank_account_number && !user.digital_rupee_id && !user.cdm_bank_number) {
            return res.status(400).json({
                error: "Please set up your payment details (UPI ID, Phone Number, or Bank Account) in your Profile before creating an ad."
            });
        }

        const { type, token, amount, rate, payment_methods, expires_in, chain, group_id, note, excluded_dealers, allowed_dealers, new_traders_only, avoid_new_traders, require_kyc } = req.body;
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
            const orConditions: string[] = [];
            for (const uname of excludedUsernames) {
                orConditions.push(`username.ilike.${uname}`);
                orConditions.push(`phone_number.ilike.%${uname}%`);
                orConditions.push(`whatsapp_phone.ilike.%${uname}%`);
            }
            const { data: matchedUsers } = await dbInstance
                .from("users")
                .select("id, telegram_id, whatsapp_phone, phone_number")
                .or(orConditions.join(','));

            if (matchedUsers) {
                for (const u of matchedUsers) {
                    if (u.telegram_id) resolvedDealerIds.push(String(u.telegram_id));
                    if (u.id) resolvedDealerIds.push(String(u.id));
                    if (u.whatsapp_phone) resolvedDealerIds.push(String(u.whatsapp_phone));
                    if (u.phone_number) resolvedDealerIds.push(String(u.phone_number));
                }
            }
        }

        // 👥 Whitelist / Specific Dealers Resolution
        let resolvedAllowedDealerIds: string[] = [];
        let allowedUsernames: string[] = [];

        if (typeof allowed_dealers === 'string' && allowed_dealers.trim()) {
            allowedUsernames = allowed_dealers.split(',')
                .map(u => u.trim().replace('@', ''))
                .filter(u => u.length > 0);
        } else if (Array.isArray(allowed_dealers)) {
            allowedUsernames = allowed_dealers
                .map(u => String(u).trim().replace('@', ''))
                .filter(u => u.length > 0);
        }

        if (allowedUsernames.length > 0) {
            const dbInstance = (db as any).getClient();
            const orConditions: string[] = [];
            for (const uname of allowedUsernames) {
                orConditions.push(`username.ilike.${uname}`);
                orConditions.push(`phone_number.ilike.%${uname}%`);
                orConditions.push(`whatsapp_phone.ilike.%${uname}%`);
            }
            const { data: matchedUsers } = await dbInstance
                .from("users")
                .select("id, telegram_id, whatsapp_phone, phone_number, username")
                .or(orConditions.join(','));

            if (matchedUsers) {
                for (const u of matchedUsers) {
                    if (u.telegram_id) resolvedAllowedDealerIds.push(String(u.telegram_id));
                    if (u.id) resolvedAllowedDealerIds.push(String(u.id));
                    if (u.whatsapp_phone) resolvedAllowedDealerIds.push(String(u.whatsapp_phone));
                    if (u.phone_number) resolvedAllowedDealerIds.push(String(u.phone_number));
                    if (u.username) resolvedAllowedDealerIds.push(String(u.username).toLowerCase());
                }
            }
            // Also retain literal raw tokens for direct match
            for (const uname of allowedUsernames) {
                resolvedAllowedDealerIds.push(uname.toLowerCase());
            }
        }

        const orderChain = chain || 'bsc';
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

        const isWaSession = Boolean(tgAny.is_wa_user);
        const orderSource = isWaSession ? "whatsapp" : "telegram";

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
            source: orderSource,
            payment_details: {
                upi: user.upi_id || "",
                group_id: group_id ? parseInt(group_id.toString()) : undefined,
                note: note ? note.toString().slice(0, 200) : undefined,
                publish_channel: req.body.publish_channel || "both",
                excluded_dealers: resolvedDealerIds,
                excluded_usernames: excludedUsernames,
                allowed_dealers: resolvedAllowedDealerIds,
                allowed_usernames: allowedUsernames,
                avoid_new_traders: !!avoid_new_traders || !!new_traders_only,
                new_traders_only: !!avoid_new_traders || !!new_traders_only,
                require_kyc: !!require_kyc || !!req.body.require_kyc
            },
        });

        res.json({ order });

        const publishChannel = req.body.publish_channel || "both"; // 'both' | 'whatsapp' | 'telegram'
        const orderWithUserData = {
            ...order,
            source: orderSource,
            username: user.username || user.first_name || "anon",
            trust_score: user.trust_score ?? 100,
            is_verified: Boolean(user.is_verified || user.kyc_status === 'approved'),
            users: user
        };

        // Broadcast to Telegram channels/groups (Telegram ads & Web dashboard ads)
        if (!isWaSession || publishChannel === "telegram" || publishChannel === "both") {
            import("../bot").then(({ broadcastAd }) => {
                broadcastAd(orderWithUserData, user).catch(console.error);
            }).catch(console.error);
        }

        // Broadcast to WhatsApp groups ONLY when ad is created from WhatsApp bot
        if (isWaSession && (publishChannel === "whatsapp" || publishChannel === "both")) {
            import("../whatsapp/handlers/group").then(({ broadcastNewAdToGroups }) => {
                broadcastNewAdToGroups(orderWithUserData).catch(console.error);
            }).catch(console.error);
        }
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

        if (user.is_banned) {
            return res.status(403).json({
                error: "⛔ Your account has been restricted from trading. Please contact support for assistance."
            });
        }

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
                String(id) === String(user.telegram_id) || String(id) === String(user.id) ||
                (user.whatsapp_phone && String(id) === String(user.whatsapp_phone)) ||
                (user.phone_number && String(id) === String(user.phone_number)) ||
                (user.username && String(id).toLowerCase() === String(user.username).toLowerCase())
            );
            if (isExcluded) {
                return res.status(400).json({
                    error: "This order is not available to you. The creator has restricted access for your account."
                });
            }
        }

        // Check if the order is restricted to specific allowed dealers only (Whitelist)
        const allowedDealers = order.payment_details?.allowed_dealers || [];
        if (allowedDealers.length > 0) {
            const isAllowed = allowedDealers.some((id: any) =>
                String(id) === String(user.telegram_id) ||
                String(id) === String(user.id) ||
                (user.whatsapp_phone && String(id) === String(user.whatsapp_phone)) ||
                (user.phone_number && String(id) === String(user.phone_number)) ||
                (user.username && String(id).toLowerCase() === String(user.username).toLowerCase())
            );
            if (!isAllowed) {
                return res.status(400).json({
                    error: "🔒 This order is restricted to specific approved dealers only chosen by the merchant."
                });
            }
        }

        // Check if the order is restricted to avoid new traders (requires at least 1 completed trade)
        if (order.payment_details?.avoid_new_traders || order.payment_details?.new_traders_only) {
            if ((user.completed_trades || 0) < 1) {
                return res.status(400).json({
                    error: "This order is restricted to experienced traders. Accounts with 0 completed trades cannot take this ad."
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

        // WhatsApp Merchant Order Rule: Only redirect to WhatsApp if the ad was created on WhatsApp OR seller is pure WhatsApp-only (no Telegram)
        const sellerUser = await db.getUserById(order.user_id);
        const isWaMerchantOrder = Boolean(
            order.source === "whatsapp" ||
            (!sellerUser?.telegram_id && (sellerUser?.whatsapp_phone || sellerUser?.phone_number))
        );

        const isCallingFromWeb = Boolean(
            (req.telegramUser as any)?.is_wa_user ||
            req.headers["x-client-platform"] === "web" ||
            req.headers["origin"]?.includes("p2pfather.com")
        );

        if (isWaMerchantOrder && !isCallingFromWeb) {
            const waBotPhone = env.WA_BOT_NUMBER || "917012751478";
            return res.status(400).json({
                error: "💬 This ad was posted by a WhatsApp merchant. To trade with this merchant, please open the trade via WhatsApp Bot or on the Web Dashboard (p2pfather.com/webapp).",
                is_wa_redirect: true,
                wa_url: `https://wa.me/${waBotPhone}?text=trade_ad_${order.id}`,
                web_url: "https://p2pfather.com/webapp"
            });
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

            // 1. Check Seller's Vault Balance
            let tokenAddress: string;
            try {
                tokenAddress = await escrow.resolveTokenAddressForTrade(
                    seller.wallet_address!,
                    order.token || "USDT",
                    tradeAmount,
                    order.chain as any
                );

                const balance = await escrow.getVaultBalance(seller.wallet_address!, tokenAddress, order.chain as any);
                if (parseFloat(balance) < tradeAmount) {
                    // ROLLBACK FILL
                    await db.revertFillOrder(order_id, tradeAmount);
                    return res.status(400).json({
                        error: `Seller has insufficient Vault balance (${balance}). Please Deposit ${tradeAmount} ${order.token} to Vault first.`
                    });
                }
            } catch (err: any) {
                await db.revertFillOrder(order_id, tradeAmount);
                return res.status(500).json({ error: "Failed to verify vault balance: " + err.message });
            }

            // 2. FIRE: Submit tx on-chain WITHOUT waiting for confirmation (avoids client timeout)
            let txHash: string;
            try {
                console.log(`[TRADES] Submitting trade tx for ${seller.wallet_address} -> ${receiveAddress} on ${order.chain}. Lock: ${tradeAmount}`);
                const submitted = await escrow.submitRelayedTrade(
                    seller.wallet_address!,
                    receiveAddress,
                    tokenAddress!,
                    tradeAmount.toString(),
                    1800, // 30 mins
                    order.chain as any
                );
                txHash = submitted.txHash;
            } catch (err: any) {
                console.error("[MINIAPP] Failed to submit trade tx:", err);
                await db.revertFillOrder(order_id, tradeAmount);
                return res.status(500).json({ error: "Failed to submit trade on-chain: " + err.message });
            }

            // 3. Immediately save trade to DB with status "pending_escrow"
            // (funds are in-flight on-chain, we'll update to "in_escrow" once confirmed)
            let trade: any;
            try {
                trade = await db.createTrade({
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
                    status: "in_escrow",  // treat as in_escrow since tx is submitted
                    fee_amount: feeAmount as any,
                    fee_percentage: feePercent as any,
                    buyer_receives: buyerReceives as any,
                    escrow_tx_hash: txHash,
                    on_chain_trade_id: null, // will be updated once block is confirmed
                    escrow_locked_at: new Date().toISOString() as any,
                });
            } catch (dbErr: any) {
                console.error("[MINIAPP] db.createTrade failed after tx submission:", dbErr);
                // We already submitted on-chain — do NOT revert fill order or the liquidity sync
                // will cancel the ad. Log for manual intervention.
                console.error(`[MINIAPP] CRITICAL: Trade tx ${txHash} submitted on ${order.chain} but DB save failed. Manual recovery needed.`);
                await db.revertFillOrder(order_id, tradeAmount);
                return res.status(500).json({ error: "Trade submitted on-chain but database save failed. Please contact support." });
            }

            // 4. RESPOND immediately — client gets the trade back without waiting for block confirmation
            res.json({ trade });

            // 5. BACKGROUND: Wait for block confirmation and update on_chain_trade_id
            (async () => {
                try {
                    console.log(`[TRADES] Waiting for block confirmation of tx ${txHash} on ${order.chain}...`);
                    const onChainTradeId = await escrow.confirmRelayedTrade(txHash, order.chain as any);
                    console.log(`[TRADES] Trade confirmed on-chain! tradeId=${onChainTradeId} for DB trade ${trade.id}`);

                    // Update DB trade with the real on-chain trade ID
                    const dbClient = (db as any).getClient();
                    await dbClient.from("trades")
                        .update({ on_chain_trade_id: Number(onChainTradeId), escrow_tx_hash: "relayed_" + onChainTradeId })
                        .eq("id", trade.id);

                    console.log(`[TRADES] DB trade ${trade.id} updated with on_chain_trade_id=${onChainTradeId}`);
                } catch (confirmErr: any) {
                    console.error(`[TRADES] CRITICAL: Failed to confirm tx ${txHash} for DB trade ${trade.id}:`, confirmErr.message);
                    // The on-chain tx may have failed. Refund and cancel the DB trade.
                    // This is a rare edge case (tx rejected by chain).
                }
            })();

            // Update the Telegram broadcast message live status (background non-blocking)
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

            // BACKGROUND NOTIFICATIONS (non-blocking)
            try {
                const coin = trade.token;
                const amountStr = trade.amount;
                const fiat = trade.fiat_amount;

                // 1. Notify Seller
                notifyTradeUpdate(seller.id,
                    `🤝 <b>Trade Matched!</b>\n\nBuyer <b>${escapeHTML(buyer.first_name || 'User')}</b> is ready to buy <b>${amountStr} ${coin}</b> for <b>₹${parseFloat(fiat.toString()).toLocaleString()}</b>.\n\nFunds are locked in Escrow. Please wait for payment UTR.`
                ).catch(console.error);

                // 2. Notify Buyer
                notifyTradeUpdate(buyer.id,
                    `💸 <b>Funds in Escrow!</b>\n\nYou are buying <b>${amountStr} ${coin}</b> from <b>${escapeHTML(seller.first_name || 'User')}</b>.\n\nPlease transfer <b>₹${parseFloat(fiat.toString()).toLocaleString()}</b> to the seller's UPI and submit the UTR.`
                ).catch(console.error);
            } catch (notifyErr) {
                console.error("[MINIAPP] Trade notification error:", notifyErr);
            }
        } catch (tradeErr: any) {
            console.error("[MINIAPP] Unexpected trade error:", tradeErr);
            await db.revertFillOrder(order_id, tradeAmount);
            if (!res.headersSent) {
                return res.status(500).json({ error: tradeErr?.message || "Internal trade creation error" });
            }
        }
    } catch (err: any) {
        console.error("[MINIAPP] Create trade error:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
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
            // ⚠️ POLICY: Auto-release is DISABLED.
            // Crypto is ONLY released by Admin verification on Telegram.
            // auto_release_at is intentionally left null.
            auto_release_at: null,
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
                if (releaseTxHash === "already_released") {
                    releaseTxHash = trade.release_tx_hash || trade.escrow_tx_hash || null;
                }
            } catch (escrowErr: any) {
                console.error("[MINIAPP] Escrow release failed:", escrowErr);
                // Check if trade is actually completed on-chain
                const onChainStatus = await escrow.getOnChainTradeStatus(trade.on_chain_trade_id, trade.chain as any);
                if (onChainStatus === 4) {
                    console.log(`[MINIAPP] On-chain trade ${trade.on_chain_trade_id} is already completed. Finalizing DB state.`);
                    releaseTxHash = trade.release_tx_hash || trade.escrow_tx_hash || null;
                } else {
                    // Revert to 'fiat_sent' so user can retry
                    await db.updateTrade(trade.id, { status: "fiat_sent" });
                    return res.status(500).json({ error: "Failed to release escrow: " + escrowErr.message });
                }
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

        // Process VIP Fee Cashback (e.g. rebate for qualifying VIP traders on new ads)
        feeCashbackService.processTradeFeeCashback(trade.id).catch(console.error);

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

        let botUsername = "p2p_fatherbot";
        try {
            botUsername = bot.botInfo?.username || (await bot.api.getMe()).username;
        } catch { /* fallback to default */ }

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
                const errMsg = escrowErr?.message || "";
                if (errMsg.includes("Trade not in refundable state") || errMsg.includes("already refunded") || errMsg.includes("Not authorized to refund") || errMsg.includes("Cannot cancel after fiat sent")) {
                    console.log(`[MINIAPP] Trade #${trade.on_chain_trade_id} was already refunded/closed on-chain. Marking as refunded in DB.`);
                } else {
                    console.error("[MINIAPP] Escrow refund failed:", escrowErr);
                    return res.status(500).json({ error: "Failed to refund on-chain: " + escrowErr.message });
                }
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
            .select("*, seller:users!trades_seller_id_fkey(id, username, first_name, upi_id, phone_number, trust_score, wallet_type, wallet_address, receive_address), buyer:users!trades_buyer_id_fkey(id, username, first_name, trust_score, wallet_type, wallet_address, receive_address), payment_proofs(utr)")
            .in("status", ["in_escrow", "fiat_sent", "fiat_confirmed", "waiting_for_escrow", "disputed", "DISPUTED"])
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
                "id, amount, token, chain, status, created_at, fiat_amount, rate, escrow_tx_hash, release_tx_hash, buyer_custom_address, on_chain_trade_id, " +
                "seller:users!trades_seller_id_fkey(username, first_name), " +
                "buyer:users!trades_buyer_id_fkey(username, first_name)",
                { count: "exact" }
            )
            .order("created_at", { ascending: false })
            .range((page - 1) * pageSize, page * pageSize - 1);

        if (status === "active" || status === "in_escrow") {
            query = query.in("status", ["in_escrow", "fiat_sent", "fiat_confirmed", "waiting_for_escrow"]);
        } else if (status !== "all") {
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

            // Process VIP Fee Cashback if qualifying
            feeCashbackService.processTradeFeeCashback(trade.id).catch(console.error);

            // Fire notifications in parallel (non-blocking for fast admin response)
            notifyTradeUpdate(trade.buyer_id,
                `✅ <b>Dispute Resolved!</b>\n\nAdmin has released <b>${trade.amount} ${trade.token}</b> to you.`
            ).catch(console.error);
            notifyTradeUpdate(trade.seller_id,
                `⚠️ <b>Dispute Resolved!</b>\n\nAdmin has released <b>${trade.amount} ${trade.token}</b> to the buyer.`
            ).catch(console.error);

            // Immediately cancel parent order in DB so it cannot be matched or shown on marketplace
            if (trade.order_id) {
                db.updateOrder(trade.order_id, { status: "cancelled" }).catch(console.error);
            }

            res.json({ success: true, txHash });

            // Update broadcast message to CANCELLED on Telegram and delete database records
            if (trade.order_id) {
                import("../bot").then(({ deleteAdBroadcasts }) => {
                    deleteAdBroadcasts(trade.order_id, "cancelled").catch(console.error);
                }).catch(console.error);
            }
        } else {
            // Refund to seller
            let txHash: string | null = null;
            if (trade.on_chain_trade_id) {
                try {
                    txHash = await escrow.refund(trade.on_chain_trade_id, trade.chain as any);
                } catch (refundErr: any) {
                    const errMsg = refundErr?.message || "";
                    if (errMsg.includes("Trade not in refundable state") || errMsg.includes("already refunded") || errMsg.includes("Not authorized to refund") || errMsg.includes("Cannot cancel after fiat sent") || errMsg.includes("Trade not disputed")) {
                        console.log(`[ADMIN] Trade #${trade.on_chain_trade_id} was already refunded/closed on-chain. Marking as refunded in DB.`);
                    } else {
                        throw refundErr;
                    }
                }
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

            // Fire notifications in parallel (non-blocking for fast admin response)
            notifyTradeUpdate(trade.seller_id,
                `🔙 <b>Dispute Resolved!</b>\n\nAdmin has refunded <b>${trade.amount} ${trade.token}</b> to your vault.`
            ).catch(console.error);
            notifyTradeUpdate(trade.buyer_id,
                `❌ <b>Dispute Resolved!</b>\n\nAdmin has refunded the trade to the seller.`
            ).catch(console.error);

            // Add system message to trade chat
            db.createTradeMessage({
                trade_id: trade.id,
                user_id: user.id,
                message: `✅ Dispute resolved: Refunded to Seller.`,
                type: "system"
            }).catch(console.error);

            // Immediately cancel parent order in DB so it cannot be matched or shown on marketplace
            if (trade.order_id) {
                db.updateOrder(trade.order_id, { status: "cancelled" }).catch(console.error);
            }

            res.json({ success: true, txHash });

            // Update broadcast message to CANCELLED on Telegram and delete database records
            if (trade.order_id) {
                import("../bot").then(({ deleteAdBroadcasts }) => {
                    deleteAdBroadcasts(trade.order_id, "cancelled").catch(console.error);
                }).catch(console.error);
            }
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
            message: req.body?.caption || "",
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

// ── Generate WhatsApp Link Code for MiniApp UI ─────────────────────────────
router.post("/whatsapp/link-code", async (req: Request, res: Response) => {
    try {
        const telegramUser = req.telegramUser;
        if (!telegramUser) return res.status(401).json({ error: "Unauthorized" });

        let user = await db.getUserByTelegramId(telegramUser.id);
        if (!user) {
            user = await db.getOrCreateUser(telegramUser as any);
        }
        if (!user) return res.status(404).json({ error: "User not found" });

        const code = await db.createWhatsappLinkCode(user.id);
        const waBotNumber = env.WA_BOT_NUMBER || process.env.WA_BOT_NUMBER || "917012751478";

        res.json({
            code,
            expires_in_seconds: 600,
            wa_bot_number: waBotNumber,
            wa_link: `https://wa.me/${waBotNumber}?text=${encodeURIComponent(`/link ${code}`)}`,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ── Update Notification Preference ───────────────────────────────────────
router.put("/whatsapp/preference", async (req: Request, res: Response) => {
    try {
        const user = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const { channel } = req.body; // 'telegram' | 'whatsapp' | 'both'
        if (!['telegram', 'whatsapp', 'both'].includes(channel)) {
            return res.status(400).json({ error: "Invalid channel preference" });
        }

        await db.updateUser(user.id, { preferred_channel: channel } as any);
        res.json({ success: true, preferred_channel: channel });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ── Generate Telegram Link Code for Web Dashboard UI ─────────────────────────
router.post("/telegram/link-code", async (req: Request, res: Response) => {
    try {
        const telegramUser = req.telegramUser;
        if (!telegramUser) return res.status(401).json({ error: "Unauthorized" });

        let user: any = null;

        const tgAny = telegramUser as any;
        if (tgAny.whatsapp_phone) {
            user = await db.getUserByWhatsappPhone(tgAny.whatsapp_phone);
        }
        if (!user && telegramUser.id) {
            user = await db.getUserByTelegramId(telegramUser.id);
        }
        if (!user && tgAny.id) {
            user = await db.getUserById(tgAny.id);
        }
        if (!user) {
            user = await db.getOrCreateUser(telegramUser as any);
        }
        if (!user) return res.status(404).json({ error: "User not found" });

        const code = await db.createWhatsappLinkCode(user.id);
        const botUsername = process.env.BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || "p2p_fatherbot";

        res.json({
            code,
            expires_in_seconds: 600,
            bot_username: botUsername,
            tg_link: `https://t.me/${botUsername}?start=link_${code}`,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ── Unlink Telegram Account ───────────────────────────────────────────────
router.post("/telegram/unlink", async (req: Request, res: Response) => {
    try {
        const telegramUser = req.telegramUser;
        if (!telegramUser) return res.status(401).json({ error: "Unauthorized" });

        const tgAny = telegramUser as any;
        let user: any = null;
        if (tgAny.whatsapp_phone) user = await db.getUserByWhatsappPhone(tgAny.whatsapp_phone);
        if (!user && telegramUser.id) user = await db.getUserByTelegramId(telegramUser.id);
        if (!user && tgAny.id) user = await db.getUserById(tgAny.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        // 🛡️ Safeguard: Check if user has active trades in escrow
        const supabase = db.getClient();
        const { data: activeTrades } = await supabase
            .from("trades")
            .select("id, status")
            .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
            .in("status", ["matched", "in_escrow", "fiat_sent", "fiat_confirmed", "disputed"])
            .limit(1);

        if (activeTrades && activeTrades.length > 0) {
            return res.status(400).json({
                error: "Cannot unlink Telegram while you have active trades in escrow. Please finish or cancel your trades first."
            });
        }

        await db.unlinkTelegram(user.id);
        const updatedUser = await db.getUserById(user.id);
        res.json({ success: true, user: updatedUser });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ── Unlink WhatsApp Account ───────────────────────────────────────────────
router.post("/whatsapp/unlink", async (req: Request, res: Response) => {
    try {
        const telegramUser = req.telegramUser;
        if (!telegramUser) return res.status(401).json({ error: "Unauthorized" });

        const tgAny = telegramUser as any;
        let user: any = null;
        if (tgAny.whatsapp_phone) user = await db.getUserByWhatsappPhone(tgAny.whatsapp_phone);
        if (!user && telegramUser.id) user = await db.getUserByTelegramId(telegramUser.id);
        if (!user && tgAny.id) user = await db.getUserById(tgAny.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        // 🛡️ Safeguard: Check if user has active trades in escrow
        const supabase = db.getClient();
        const { data: activeTrades } = await supabase
            .from("trades")
            .select("id, status")
            .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
            .in("status", ["matched", "in_escrow", "fiat_sent", "fiat_confirmed", "disputed"])
            .limit(1);

        if (activeTrades && activeTrades.length > 0) {
            return res.status(400).json({
                error: "Cannot unlink WhatsApp while you have active trades in escrow. Please finish or cancel your trades first."
            });
        }

        await db.unlinkWhatsapp(user.id);
        const updatedUser = await db.getUserById(user.id);
        res.json({ success: true, user: updatedUser });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.put("/profile", async (req: Request, res: Response) => {
    try {
        const tgUser = req.telegramUser;
        if (!tgUser) return res.status(401).json({ error: "Unauthorized" });

        const tgAny = tgUser as any;
        let user: any = null;
        if (tgAny.whatsapp_phone) user = await db.getUserByWhatsappPhone(tgAny.whatsapp_phone);
        if (!user && tgUser.id) user = await db.getUserByTelegramId(tgUser.id);
        if (!user && tgAny.id) user = await db.getUserById(tgAny.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const {
            first_name, upi_id, phone_number, bank_account_number, bank_ifsc, bank_name,
            receive_address, cdm_bank_number, cdm_bank_name, cdm_phone,
            cdm_user_name, digital_rupee_id, bio, instagram_handle, x_handle,
            hide_group_handle
        } = req.body;
        const updates: Record<string, any> = {};
        if (first_name !== undefined && typeof first_name === 'string') updates.first_name = first_name.trim();
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

        const updatedUser = await db.getUserById(user.id);
        res.json({ user: updatedUser });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/profile/export-key", async (req: Request, res: Response) => {
    try {
        const tgUser = req.telegramUser;
        if (!tgUser) return res.status(401).json({ error: "Unauthorized" });

        const tgAny = tgUser as any;
        let user: any = null;
        if (tgAny.whatsapp_phone) user = await db.getUserByWhatsappPhone(tgAny.whatsapp_phone);
        if (!user && tgUser.id) user = await db.getUserByTelegramId(tgUser.id);
        if (!user && tgAny.id) user = await db.getUserById(tgAny.id);
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
        const tgUser = req.telegramUser;
        if (!tgUser) return res.status(401).json({ error: "Unauthorized" });

        const tgAny = tgUser as any;
        let user: any = null;
        if (tgAny.whatsapp_phone) user = await db.getUserByWhatsappPhone(tgAny.whatsapp_phone);
        if (!user && tgUser.id) user = await db.getUserByTelegramId(tgUser.id);
        if (!user && tgAny.id) user = await db.getUserById(tgAny.id);
        if (!user) return res.status(401).json({ error: "User not found" });

        const apiKey = env.DIDIT_API_KEY;
        const workflowId = env.DIDIT_WORKFLOW_ID;
        if (!apiKey || !workflowId) {
            console.error("[KYC] DIDIT_API_KEY or DIDIT_WORKFLOW_ID not configured");
            return res.status(503).json({ error: "KYC service is not configured. Please contact support." });
        }

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
        const tgUser = req.telegramUser;
        if (!tgUser) return res.status(401).json({ error: "Unauthorized" });

        const tgAny = tgUser as any;
        let user: any = null;
        if (tgAny.whatsapp_phone) user = await db.getUserByWhatsappPhone(tgAny.whatsapp_phone);
        if (!user && tgUser.id) user = await db.getUserByTelegramId(tgUser.id);
        if (!user && tgAny.id) user = await db.getUserById(tgAny.id);
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
                const apiKey = env.DIDIT_API_KEY;
                if (!apiKey) throw new Error("DIDIT_API_KEY not configured");
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
                    } else if (["not started", "expired", "abandoned", "failed", "cancelled"].includes(statusStr)) {
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
        const webhookSecret = env.DIDIT_WEBHOOK_SECRET;
        const body = req.body;
        const timestamp = req.headers["x-timestamp"] as string;

        // ── Didit HMAC-SHA256 Signature Verification ──────────────────
        if (webhookSecret) {
            if (!timestamp) {
                console.warn("[DIDIT WEBHOOK] ❌ Missing X-Timestamp header");
                return res.status(401).json({ error: "Missing X-Timestamp" });
            }

            // Replay attack protection: reject requests older than 5 minutes
            const now = Math.floor(Date.now() / 1000);
            if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
                console.warn("[DIDIT WEBHOOK] ❌ Stale timestamp — possible replay attack");
                return res.status(401).json({ error: "Stale timestamp" });
            }

            const sigV2 = req.headers["x-signature-v2"] as string;
            const sigSimple = req.headers["x-signature-simple"] as string;

            // Helper: sort object keys recursively + normalise whole floats to int
            function shortenFloats(data: any): any {
                if (Array.isArray(data)) return data.map(shortenFloats);
                if (data !== null && typeof data === "object") {
                    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, shortenFloats(v)]));
                }
                if (typeof data === "number" && !Number.isInteger(data) && data % 1 === 0) return Math.trunc(data);
                return data;
            }
            function sortKeys(obj: any): any {
                if (Array.isArray(obj)) return obj.map(sortKeys);
                if (obj !== null && typeof obj === "object") {
                    return Object.keys(obj).sort().reduce((acc: any, k) => { acc[k] = sortKeys(obj[k]); return acc; }, {});
                }
                return obj;
            }

            let verified = false;

            if (sigV2) {
                // V2: HMAC-SHA256 of canonical sorted-key JSON
                const canonical = JSON.stringify(sortKeys(shortenFloats(body)));
                const expected = crypto.createHmac("sha256", webhookSecret).update(canonical, "utf8").digest("hex");
                const a = Buffer.from(expected, "utf8");
                const b = Buffer.from(sigV2, "utf8");
                if (a.length === b.length && crypto.timingSafeEqual(a, b)) verified = true;
            }

            if (!verified && sigSimple) {
                // Simple: HMAC of "timestamp:session_id:status:webhook_type"
                const canonical = [
                    body.timestamp ?? "",
                    body.session_id ?? "",
                    body.status ?? "",
                    body.webhook_type ?? "",
                ].join(":");
                const expected = crypto.createHmac("sha256", webhookSecret).update(canonical).digest("hex");
                const a = Buffer.from(expected, "utf8");
                const b = Buffer.from(sigSimple, "utf8");
                if (a.length === b.length && crypto.timingSafeEqual(a, b)) verified = true;
            }

            if (!verified) {
                console.warn("[DIDIT WEBHOOK] ❌ Invalid HMAC signature — request rejected");
                return res.status(401).json({ error: "Unauthorized webhook" });
            }
        } else {
            console.warn("[DIDIT WEBHOOK] ⚠️  DIDIT_WEBHOOK_SECRET not set — skipping signature check (insecure!)");
        }
        // ─────────────────────────────────────────────────────────────

        console.log("[DIDIT WEBHOOK] ✅ Verified event:", body.webhook_type || body.event, "Session:", body.session_id);

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

            // Broadcast Godfather Made Man card to all Telegram groups
            try {
                const targetUser = await db.getUserById(userId);
                if (targetUser) {
                    const { broadcastKycApprovalTelegram } = await import("../bot");
                    await broadcastKycApprovalTelegram(targetUser).catch(() => {});
                }
            } catch (e) {
                console.error("[KYC] Failed to broadcast Telegram approval:", e);
            }
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




router.get("/users", async (req: Request, res: Response) => {
    try {
        const query = (req.query.search as string || "").trim();
        const client = (db as any).getClient();
        let dbQuery = client
            .from("users")
            .select("id, username, first_name, photo_url, completed_trades, is_banned");

        if (query) {
            const cleanQuery = query.replace(/[%_,]/g, "");
            if (cleanQuery) {
                dbQuery = dbQuery.or(`username.ilike.%${cleanQuery}%,first_name.ilike.%${cleanQuery}%,wallet_address.ilike.%${cleanQuery}%,receive_address.ilike.%${cleanQuery}%`);
            }
        }

        const { data, error } = await dbQuery
            .order("completed_trades", { ascending: false })
            .limit(query ? 50 : 200);

        if (error) throw error;
        res.json({ users: data || [] });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/admin/users/:userId/toggle-ban", async (req: Request, res: Response) => {
    try {
        const adminUser = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!adminUser) return res.status(401).json({ error: "User not found" });

        const isAdmin = env.ADMIN_IDS.includes(Number(adminUser.telegram_id));
        if (!isAdmin) return res.status(403).json({ error: "Admin only" });

        const targetUserId = req.params.userId as string;
        const targetUser = await db.getUserById(targetUserId);
        if (!targetUser) return res.status(404).json({ error: "Target trader not found" });

        const newBannedStatus = !targetUser.is_banned;
        await db.updateUser(targetUserId, { is_banned: newBannedStatus } as any);

        const targetLabel = targetUser.username ? `@${targetUser.username}` : (targetUser.first_name || targetUser.id);
        console.log(`[ADMIN] ${adminUser.username} ${newBannedStatus ? 'BANNED' : 'UNBANNED'} trader ${targetLabel}`);

        res.json({
            success: true,
            is_banned: newBannedStatus,
            message: `User @${targetUser.username || targetUser.first_name} is now ${newBannedStatus ? 'BANNED' : 'UNBANNED'}.`
        });
    } catch (err: any) {
        console.error("[ADMIN] Toggle ban error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ── Admin: Get Multi-Account IP Clusters ─────────────────────────────────
router.get("/admin/ip-clusters", async (req: Request, res: Response) => {
    try {
        const adminUser = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!adminUser || !env.ADMIN_IDS.includes(Number(adminUser.telegram_id))) {
            return res.status(403).json({ error: "Admin only" });
        }

        const clusters = await IpTrackerService.getMultiAccountClusters();
        res.json({ success: true, clusters });
    } catch (err: any) {
        console.error("[ADMIN] Get IP clusters error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ── Admin: Kick / Ban All Accounts on an IP ─────────────────────────────
router.post("/admin/kick-ip-all", async (req: Request, res: Response) => {
    try {
        const adminUser = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!adminUser || !env.ADMIN_IDS.includes(Number(adminUser.telegram_id))) {
            return res.status(403).json({ error: "Admin only" });
        }

        const { ip } = req.body;
        if (!ip) return res.status(400).json({ error: "IP address required" });

        const result = await IpTrackerService.banAllOnIp(ip);
        res.json({ ...result });
    } catch (err: any) {
        console.error("[ADMIN] Kick all on IP error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ── Admin: Block IP Address & Ban All Users ─────────────────────────────
router.post("/admin/block-ip", async (req: Request, res: Response) => {
    try {
        const adminUser = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!adminUser || !env.ADMIN_IDS.includes(Number(adminUser.telegram_id))) {
            return res.status(403).json({ error: "Admin only" });
        }

        const { ip } = req.body;
        if (!ip) return res.status(400).json({ error: "IP address required" });

        const result = await IpTrackerService.blockIp(ip);
        res.json({ ip, ...result });
    } catch (err: any) {
        console.error("[ADMIN] Block IP error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ── Admin: Unblock IP Address ──────────────────────────────────────────
router.post("/admin/unblock-ip", async (req: Request, res: Response) => {
    try {
        const adminUser = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!adminUser || !env.ADMIN_IDS.includes(Number(adminUser.telegram_id))) {
            return res.status(403).json({ error: "Admin only" });
        }

        const { ip } = req.body;
        if (!ip) return res.status(400).json({ error: "IP address required" });

        const unblocked = IpTrackerService.unblockIp(ip);
        res.json({ success: unblocked, ip });
    } catch (err: any) {
        console.error("[ADMIN] Unblock IP error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ── Admin: Get Blocked IPs List ────────────────────────────────────────
router.get("/admin/blocked-ips", async (req: Request, res: Response) => {
    try {
        const adminUser = await db.getUserByTelegramId(req.telegramUser!.id);
        if (!adminUser || !env.ADMIN_IDS.includes(Number(adminUser.telegram_id))) {
            return res.status(403).json({ error: "Admin only" });
        }

        const blockedIps = IpTrackerService.getBlockedIps();
        res.json({ success: true, blockedIps });
    } catch (err: any) {
        console.error("[ADMIN] Get blocked IPs error:", err);
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
            .select("id, username, first_name, photo_url, completed_trades, total_volume, trade_count, created_at, is_banned")
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

        const targetUserId = req.params.userId as string;
        const avgMinutes = await db.getUserAvgCompletionMinutes(targetUserId);

        res.json({
            id: user.id,
            username: user.username,
            first_name: user.first_name,
            photo_url: user.photo_url,
            is_banned: user.is_banned || false,
            completed_trades: totalAttempted, // Using total attempts to match leaderboard 'Trades'
            buy_count: buyCount,
            sell_count: sellCount,
            total_volume: parseFloat(totalVolumeUsdt.toString()),
            completion_rate: completionRate,
            avg_completion_minutes: avgMinutes,
            level,
            member_since: user.created_at,
        });
    } catch (err: any) {
        console.error("[MINIAPP] Trader profile error:", err);
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



