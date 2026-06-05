import fs from 'fs';

// 1. Fix miniapp.ts
let miniapp = fs.readFileSync('src/api/miniapp.ts', 'utf8');
miniapp = miniapp.replace(
    /\.not\("wallet_index", "is", null\)\n\s*\.gte\("wallet_index", 0\)/,
    `.not("wallet_index", "is", null)
            .gte("wallet_index", 0)
            .not("polymarket_api_key", "is", null)
            .not("deposit_wallet_address", "is", null)`
);
fs.writeFileSync('src/api/miniapp.ts', miniapp);

// 2. Fix polymarket.ts
let polymarket = fs.readFileSync('src/services/polymarket.ts', 'utf8');

const oldGet = /async function polymarketGet\([\s\S]*?\/\/ ==========================================/;
const newGet = `async function polymarketGet(hostname: string, path: string, params?: any, extraOptions?: any) {
    return axios.get(\`https://\${hostname}\${path}\`, {
        params,
        timeout: 8000,
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; P2PFather/1.0)",
            "Accept": "application/json",
            ...(extraOptions?.headers || {})
        },
        ...extraOptions
    });
}
// ==========================================`;

polymarket = polymarket.replace(oldGet, newGet);
fs.writeFileSync('src/services/polymarket.ts', polymarket);
