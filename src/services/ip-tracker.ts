import { Request } from "express";
import { db } from "../db/client";

// In-memory cache for fast IP lookups & batching DB writes
const userIpCache = new Map<string, { ip: string; lastSeen: string }>();

// Blocked scammer IP list (initialized with known scammer IPs)
const blockedIps = new Set<string>(["106.76.190.72"]);

export class IpTrackerService {
    /**
     * Checks if an IP address is blocked
     */
    static isIpBlocked(ip: string): boolean {
        if (!ip || ip === 'unknown') return false;
        const cleanIp = ip.trim();
        return blockedIps.has(cleanIp);
    }

    /**
     * Adds an IP to the blocked scammer list and bans all associated users in DB
     */
    static async blockIp(ip: string): Promise<{ success: boolean; bannedCount: number }> {
        if (!ip || ip === 'unknown') return { success: false, bannedCount: 0 };
        const cleanIp = ip.trim();
        blockedIps.add(cleanIp);
        return await this.banAllOnIp(cleanIp);
    }

    /**
     * Removes an IP from the blocked list
     */
    static unblockIp(ip: string): boolean {
        if (!ip) return false;
        return blockedIps.delete(ip.trim());
    }

    /**
     * Gets all currently blocked IP addresses
     */
    static getBlockedIps(): string[] {
        return Array.from(blockedIps);
    }

    /**
     * Extracts client IP from request headers (Cloudflare, Railway proxy, or direct)
     */
    static getClientIp(req: Request): string {
        const xForwarded = req.headers['x-forwarded-for'];
        if (typeof xForwarded === 'string') {
            const first = xForwarded.split(',')[0].trim();
            if (first) return first;
        }
        const cfIp = req.headers['cf-connecting-ip'];
        if (typeof cfIp === 'string' && cfIp.trim()) {
            return cfIp.trim();
        }
        return req.ip || req.socket.remoteAddress || 'unknown';
    }

    /**
     * Logs user IP on MiniApp requests
     */
    static async logIp(userId: string, req: Request): Promise<void> {
        if (!userId) return;
        const ip = this.getClientIp(req);
        if (!ip || ip === 'unknown' || ip === '::1' || ip === '127.0.0.1') return;

        // Auto-ban user if visiting from a blocked IP
        if (this.isIpBlocked(ip)) {
            console.warn(`[IP-Tracker] ⛔ User ${userId} accessed from blocked scammer IP: ${ip}. Marking as banned.`);
            await this.banUser(userId);
        }

        const cached = userIpCache.get(userId);
        const now = new Date().toISOString();

        // Update cache & DB if IP changed or last write > 5 mins ago
        if (!cached || cached.ip !== ip) {
            userIpCache.set(userId, { ip, lastSeen: now });

            try {
                const supabase = db.getClient();
                // Store IP tracking payload in predictions_cache json column
                const ipPayload = {
                    last_ip: ip,
                    last_seen_at: now
                };

                await supabase
                    .from("users")
                    .update({ predictions_cache: ipPayload } as any)
                    .eq("id", userId);
            } catch (err: any) {
                console.warn("[IP-Tracker] Failed to persist IP to DB:", err?.message);
            }
        }
    }

    /**
     * Retrieves all multi-account clusters (IP addresses shared by 2+ users)
     */
    static async getMultiAccountClusters(): Promise<any[]> {
        const supabase = db.getClient();
        
        // Fetch all users with predictions_cache IP data
        const { data: users, error } = await supabase
            .from("users")
            .select("id, telegram_id, username, first_name, is_banned, created_at, photo_url, predictions_cache, whatsapp_phone");

        if (error || !users) {
            console.error("[IP-Tracker] Error fetching users for clusters:", error);
            return [];
        }

        // Group users by last_ip
        const ipMap = new Map<string, any[]>();

        for (const u of users) {
            const cache = u.predictions_cache || {};
            const ip = cache.last_ip;
            if (ip && ip !== 'unknown') {
                if (!ipMap.has(ip)) {
                    ipMap.set(ip, []);
                }
                ipMap.get(ip)!.push({
                    id: u.id,
                    telegram_id: u.telegram_id,
                    username: u.username,
                    first_name: u.first_name,
                    whatsapp_phone: u.whatsapp_phone,
                    is_banned: u.is_banned,
                    created_at: u.created_at,
                    photo_url: u.photo_url,
                    last_seen_at: cache.last_seen_at || u.created_at
                });
            }
        }

        // Build list of clusters (show all logged IPs, prioritizing target watchlist and multi-account clusters)
        const targetKeywords = process.env.IP_WATCHLIST_KEYWORDS
            ? process.env.IP_WATCHLIST_KEYWORDS.split(",").map(k => k.trim().toLowerCase()).filter(Boolean)
            : [];

        const clusters: any[] = [];
        ipMap.forEach((userList, ip) => {
            const hasTarget = userList.some(u => {
                const text = `${u.username || ''} ${u.first_name || ''} ${u.telegram_id}`.toLowerCase();
                return targetKeywords.some(kw => text.includes(kw));
            });

            const isBlocked = this.isIpBlocked(ip);

            clusters.push({
                ip,
                user_count: userList.length,
                is_multi: userList.length > 1,
                has_target: hasTarget,
                is_blocked: isBlocked,
                users: userList.map(u => {
                    const text = `${u.username || ''} ${u.first_name || ''} ${u.telegram_id}`.toLowerCase();
                    const isTargetUser = targetKeywords.some(kw => text.includes(kw));
                    return { ...u, is_target: isTargetUser };
                }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            });
        });

        // Sort: Watchlist targets FIRST, then multi-account IPs, then count
        clusters.sort((a, b) => {
            if (a.has_target && !b.has_target) return -1;
            if (!a.has_target && b.has_target) return 1;
            return b.user_count - a.user_count;
        });

        return clusters;
    }

    /**
     * Bans a specific user ID
     */
    static async banUser(userId: string): Promise<boolean> {
        const supabase = db.getClient();
        const { error } = await supabase
            .from("users")
            .update({ is_banned: true, updated_at: new Date().toISOString() })
            .eq("id", userId);

        if (error) {
            console.error("[IP-Tracker] Failed to ban user:", error.message);
            return false;
        }
        return true;
    }

    /**
     * Unbans a specific user ID
     */
    static async unbanUser(userId: string): Promise<boolean> {
        const supabase = db.getClient();
        const { error } = await supabase
            .from("users")
            .update({ is_banned: false, updated_at: new Date().toISOString() })
            .eq("id", userId);

        if (error) {
            console.error("[IP-Tracker] Failed to unban user:", error.message);
            return false;
        }
        return true;
    }

    /**
     * Bans ALL users on a specific IP address
     */
    static async banAllOnIp(ip: string): Promise<{ success: boolean; bannedCount: number }> {
        const clusters = await this.getMultiAccountClusters();
        const cluster = clusters.find(c => c.ip === ip);
        if (!cluster || !cluster.users) return { success: false, bannedCount: 0 };

        let count = 0;
        for (const u of cluster.users) {
            if (!u.is_banned) {
                const ok = await this.banUser(u.id);
                if (ok) count++;
            }
        }
        return { success: true, bannedCount: count };
    }
}
