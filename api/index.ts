// P2PFather Stats API — v2
import { db } from "../src/db/client";

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const stats = await db.getStats();
        return res.json({
            total_users:  stats.total_users,
            total_trades: stats.completed_trades,
            total_volume: stats.total_volume_generic,
        });
    } catch (e: any) {
        console.error('[stats] Error:', e?.message);
        return res.status(500).json({ error: 'Failed to fetch stats' });
    }
}
