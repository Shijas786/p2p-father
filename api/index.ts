import { db } from "../src/db/client";

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'GET') {
        try {
            const stats = await db.getStats();
            res.json({
                total_users: stats.total_users,
                total_trades: stats.completed_trades,
                total_volume: stats.total_volume_generic,
            });
        } catch (e) {
            console.error("API Error:", e);
            res.status(500).json({ error: "Failed to fetch stats" });
        }
    } else {
        res.status(405).json({ error: "Method not allowed" });
    }
}
