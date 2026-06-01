import { polymarketService } from "./services/polymarket";

async function run() {
    console.log("Testing Polymarket API...");
    try {
        const market = await polymarketService.getActiveBtcMarket();
        console.log("Active BTC Market:", market);
        
        const yesPrice = await polymarketService.getOutcomePrice(market.yesTokenId, false);
        const noPrice = await polymarketService.getOutcomePrice(market.noTokenId, true);
        
        console.log("Yes Price:", yesPrice);
        console.log("No Price:", noPrice);
    } catch (e) {
        console.error("Fatal Error:", e);
    }
}

run();
