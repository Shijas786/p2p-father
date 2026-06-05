import { polymarketService } from "../src/services/polymarket";

async function run() {
    try {
        const proxyAddress = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";
        const trades = await polymarketService.getTradesForProxy(proxyAddress);
        console.log(`Proxy ${proxyAddress} has ${trades.length} trades`);
    } catch (e: any) {
        console.log("Error:", e.message);
    }
}
run();
