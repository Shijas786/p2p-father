import Redis from "ioredis";
import { env } from "../config/env";

let redisClient: Redis | null = null;
const memoryCache = new Map<string, { value: string; expiresAt: number }>();

if (env.REDIS_URL) {
    try {
        redisClient = new Redis(env.REDIS_URL, {
            maxRetriesPerRequest: 3,
            lazyConnect: true // don't block bot startup if redis is unreachable
        });
        redisClient.on("error", (err) => {
            console.error("[Redis] Client error:", err.message);
        });
        redisClient.connect().then(() => {
            console.log("[Redis] Connected successfully.");
        }).catch((err) => {
            console.error("[Redis] Failed to connect:", err.message);
        });
    } catch (e: any) {
        console.error("[Redis] Initialization error:", e.message);
    }
} else {
    console.log("[Redis] REDIS_URL not configured. Using in-memory fallback cache.");
}

/** Expose the raw ioredis client for commands not wrapped by the helper (e.g. INCR, EXPIRE for rate limiting) */
export function getRawRedisClient() {
    return redisClient;
}


export const redis = {
    async get(key: string): Promise<string | null> {
        if (redisClient) {
            try {
                return await redisClient.get(key);
            } catch (err: any) {
                console.error(`[Redis] get error for key ${key}:`, err.message);
            }
        }
        
        // Memory fallback
        const item = memoryCache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
            memoryCache.delete(key);
            return null;
        }
        return item.value;
    },

    async set(key: string, value: string): Promise<void> {
        if (redisClient) {
            try {
                await redisClient.set(key, value);
                return;
            } catch (err: any) {
                console.error(`[Redis] set error for key ${key}:`, err.message);
            }
        }
        // Memory fallback (expire after 1 hour default if not setex)
        memoryCache.set(key, { value, expiresAt: Date.now() + 3600 * 1000 });
    },

    async setex(key: string, seconds: number, value: string): Promise<void> {
        if (redisClient) {
            try {
                await redisClient.setex(key, seconds, value);
                return;
            } catch (err: any) {
                console.error(`[Redis] setex error for key ${key}:`, err.message);
            }
        }
        // Memory fallback
        memoryCache.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
    },

    async del(key: string): Promise<void> {
        if (redisClient) {
            try {
                await redisClient.del(key);
                return;
            } catch (err: any) {
                console.error(`[Redis] del error for key ${key}:`, err.message);
            }
        }
        memoryCache.delete(key);
    }
};
