/**
 * Distributed Rate Limiter — Redis-backed with in-memory fallback
 *
 * Uses a fixed-window counter stored in Redis (INCR + EXPIRE).
 * When Redis is unavailable, falls back gracefully to an in-process Map
 * so the app keeps running (limits are local to the process only during fallback).
 *
 * Usage:
 *   const allowed = await checkRateLimit('otp_phone:+919876543210', 3, 600);
 *   if (!allowed) return res.status(429).json({ error: 'Too many requests.' });
 */

import { getRawRedisClient } from "./redis";

// In-process fallback (used when Redis is unavailable)
const _fallback = new Map<string, { count: number; resetAt: number }>();

/**
 * Check and increment a rate limit counter.
 *
 * @param key        Unique key for the rate limit window (e.g. `otp_phone:+91...`)
 * @param maxHits    Maximum allowed hits in the window
 * @param windowSec  Window duration in SECONDS
 * @returns          true = request is allowed, false = limit exceeded
 */
export async function checkRateLimit(
    key: string,
    maxHits: number,
    windowSec: number
): Promise<boolean> {
    const prefixed = `rl:${key}`;

    // ── Try Redis first ───────────────────────────────────────────────────────
    const client = getRawRedisClient();
    if (client) {
        try {
            // INCR atomically increments the counter and returns the new value.
            // On first call the key doesn't exist: Redis creates it at 0 and returns 1.
            const count = await client.incr(prefixed);

            if (count === 1) {
                // First hit in this window — set the TTL so Redis auto-clears the key
                await client.expire(prefixed, windowSec);
            }

            if (count > maxHits) {
                console.warn(`[RateLimit] Redis blocked: key="${prefixed}" count=${count}/${maxHits}`);
                return false; // blocked
            }

            return true; // allowed
        } catch (err: any) {
            console.warn(`[RateLimit] Redis error for key ${prefixed}, falling back: ${err.message}`);
            // fall through to in-process fallback below
        }
    }

    // ── In-process fallback ───────────────────────────────────────────────────
    const now = Date.now();
    const entry = _fallback.get(prefixed);

    if (!entry || now > entry.resetAt) {
        _fallback.set(prefixed, { count: 1, resetAt: now + windowSec * 1000 });
        return true; // allowed (new window)
    }

    if (entry.count >= maxHits) {
        console.warn(`[RateLimit] Fallback blocked: key="${prefixed}" count=${entry.count}/${maxHits}`);
        return false; // blocked
    }

    entry.count++;
    return true; // allowed
}

/**
 * Manually reset a rate limit counter (e.g. after a successful OTP verification).
 */
export async function resetRateLimit(key: string): Promise<void> {
    const prefixed = `rl:${key}`;
    const client = getRawRedisClient();
    if (client) {
        try { await client.del(prefixed); } catch (_) {}
    }
    _fallback.delete(prefixed);
}
