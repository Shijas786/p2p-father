import { config } from "dotenv";
config();
import { polymarketService } from "../src/services/polymarket";

async function run() {
    const proxyAddress = '0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02';
    console.log("Fetching positions from Polymarket for proxy:", proxyAddress);
    
    const allPositions = await polymarketService.getPositionsForProxy(proxyAddress, "0").catch(() => []);
    
    console.log(`Polymarket returned ${allPositions.length} positions.`);
    
    let sumCashPnl = 0;
    for (const p of allPositions) {
        console.log(`Condition: ${p.conditionId?.slice(0, 12)}... | Asset: ${p.title || p.asset} | Size: ${p.size} | Cash PnL: $${p.cashPnl} | Net PnL: $${p.netPnl}`);
        sumCashPnl += parseFloat(p.cashPnl ?? '0') || 0;
    }
    
    console.log(`\nSum of cashPnl from Polymarket: $${sumCashPnl.toFixed(2)}`);
}

run();
