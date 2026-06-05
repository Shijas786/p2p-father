import fs from 'fs';

let content = fs.readFileSync('src/services/polymarket.ts', 'utf8');

// 1. Remove resolveWithDoH and customHttpsAgent logic
const agentRegex = /\/\/ Custom DNS over HTTPS[\s\S]*?\/\/ ==========================================/;
content = content.replace(agentRegex, `// ==========================================
// Direct IP Polymarket API Helper
// ==========================================
const POLYMARKET_IPS: Record<string, string> = {
    "data-api.polymarket.com": "104.18.34.205",
    "gamma-api.polymarket.com": "104.18.34.205",
    "clob.polymarket.com": "104.18.34.205",
};

async function polymarketGet(hostname: string, path: string, params?: any, extraOptions?: any) {
    const ip = POLYMARKET_IPS[hostname] || "104.18.34.205";
    return axios.get(\`https://\${ip}\${path}\`, {
        params,
        timeout: 8000,
        headers: {
            "Host": hostname,
            ...(extraOptions?.headers || {})
        },
        httpsAgent: new https.Agent({
            checkServerIdentity: (host, cert) => undefined
        }),
        ...extraOptions
    });
}
// ==========================================`);

// 2. Replace axios.get for GAMMA_API
content = content.replace(/axios\.get\(\`\$\{GAMMA_API\}\/events\`, \{\s*params: \{ slug \},\s*headers: \{[\s\S]*?\},\s*timeout: 5000,\s*\}\)/g, 
`polymarketGet("gamma-api.polymarket.com", "/events", { slug }, {
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "application/json",
                    "Origin": "https://polymarket.com",
                    "Referer": "https://polymarket.com/"
                }
            })`);

// 3. Replace axios.get for CLOB_API/markets and book
content = content.replace(/axios\.get\(\`\$\{CLOB_API\}\/markets\`,/g, 'polymarketGet("clob.polymarket.com", "/markets",');
content = content.replace(/axios\.get\(\`\$\{CLOB_API\}\/book\`,/g, 'polymarketGet("clob.polymarket.com", "/book",');

// 4. Replace axios.get in getTradesForProxy and getPositionsForProxy
content = content.replace(/axios\.get\(\`https:\/\/data-api\.polymarket\.com\/trades\?user=\$\{proxyAddress\}\`, \{ timeout: 5000, httpsAgent: customHttpsAgent \}\)/g, 
'polymarketGet("data-api.polymarket.com", "/trades", { user: proxyAddress })');

content = content.replace(/axios\.get\(\`https:\/\/gamma-api\.polymarket\.com\/trades\?user=\$\{proxyAddress\}\`, \{ timeout: 5000, httpsAgent: customHttpsAgent \}\)/g, 
'polymarketGet("gamma-api.polymarket.com", "/trades", { user: proxyAddress })');

content = content.replace(/axios\.get\(\`https:\/\/data-api\.polymarket\.com\/positions\?user=\$\{proxyAddress\}&sizeThreshold=0\.01\`, \{ timeout: 5000, httpsAgent: customHttpsAgent \}\)/g, 
'polymarketGet("data-api.polymarket.com", "/positions", { user: proxyAddress, sizeThreshold: "0.01" })');

content = content.replace(/axios\.get\(\`https:\/\/gamma-api\.polymarket\.com\/positions\?user=\$\{proxyAddress\}\`, \{ timeout: 5000, httpsAgent: customHttpsAgent \}\)/g, 
'polymarketGet("gamma-api.polymarket.com", "/positions", { user: proxyAddress })');

fs.writeFileSync('src/services/polymarket.ts', content);
