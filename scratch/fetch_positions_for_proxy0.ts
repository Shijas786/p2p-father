import { polymarketService } from "../src/services/polymarket";

const PROXY = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";

async function main() {
    console.log(`Fetching positions for proxy: ${PROXY}...`);
    const positions = await polymarketService.getPositionsForProxy(PROXY);
    console.log("Positions:", JSON.stringify(positions, null, 2));
}

main().catch(console.error);
