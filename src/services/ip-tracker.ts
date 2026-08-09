import { Request } from "express";
import { db } from "../db/client";

// In-memory cache for fast IP lookups & batching DB writes
const userIpCache = new Map<string, { ip: string; lastSeen: string }>();

export class IpTrackerService {
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

        // Build list of clusters (show all logged IPs, prioritizing multi-account clusters with 2+ users first)
        const clusters: any[] = [];
        ipMap.forEach((userList, ip) => {
            clusters.push({
                ip,
                user_count: userList.length,
                is_multi: userList.length > 1,
                users: userList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            });
        });

        // Sort: Multi-account IPs first, then by count descending
        clusters.sort((a, b) => b.user_count - a.user_count);

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
