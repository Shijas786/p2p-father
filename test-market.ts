import dns from "node:dns";
dns.setServers(['1.1.1.1', '1.0.0.1']);

import { polymarketService } from "./src/services/polymarket";
async function run() {
    try {
        const market = await polymarketService.getActiveBtcMarket();
        console.log("Active BTC Market:", market);
        
        const res = await fetch(`https://clob.polymarket.com/markets/${market.conditionId}`, {
            headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
        });
        const clobData = await res.json();
        console.log("Tokens:", clobData.tokens);
        console.log("Rewards/Collateral:", clobData.rewards || clobData.collateral_token || "None");
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
run();
