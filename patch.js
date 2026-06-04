const fs = require('fs');
const polymarketServicePath = 'src/services/polymarket.ts';
let code = fs.readFileSync(polymarketServicePath, 'utf8');

const methodsToAdd = `
    async getTradesForProxy(proxyAddress: string): Promise<any[]> {
        try {
            const res = await axios.get(\`https://data-api.polymarket.com/trades?user=\${proxyAddress}\`);
            const trades = Array.isArray(res.data) ? res.data : [];
            // Map asset to asset_id for legacy compatibility in miniapp
            return trades.map(t => ({ ...t, asset_id: t.asset }));
        } catch (e: any) {
            console.log("[Polymarket Data API] Failed to fetch proxy trades:", e.response?.data || e.message);
            return [];
        }
    }

    async getPositionsForProxy(proxyAddress: string): Promise<any[]> {
        try {
            const res = await axios.get(\`https://data-api.polymarket.com/positions?user=\${proxyAddress}\`);
            return Array.isArray(res.data) ? res.data : [];
        } catch (e: any) {
            console.log("[Polymarket Data API] Failed to fetch proxy positions:", e.response?.data || e.message);
            return [];
        }
    }
}

export const polymarketService = new PolymarketService();
`;

code = code.replace(/}\n\nexport const polymarketService = new PolymarketService\(\);/g, methodsToAdd);
fs.writeFileSync(polymarketServicePath, code);
