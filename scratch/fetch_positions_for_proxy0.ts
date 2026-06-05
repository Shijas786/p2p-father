import { polymarketService } from "../src/services/polymarket";

const PROXY = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";

async function main() {
    console.log(`--- FIRST CALL (should trigger API fetch) ---`);
    const positions1 = await polymarketService.getPositionsForProxy(PROXY);
    console.log(`Fetched ${positions1.length} positions.`);

    console.log(`--- SECOND CALL (should hit cache instantly) ---`);
    const positions2 = await polymarketService.getPositionsForProxy(PROXY);
    console.log(`Fetched ${positions2.length} positions.`);
}

main().catch(console.error);
