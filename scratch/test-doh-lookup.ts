import { polymarketService } from "../src/services/polymarket";
import axios from "axios";

async function run() {
    try {
        const proxyAddress = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";
        console.log("Fetching positions...");
        const res = await polymarketService.getPositionsForProxy(proxyAddress);
        console.log("Positions fetched:", res.length);
    } catch (e: any) {
        console.log("Error:", e.message);
    }
}
run();
