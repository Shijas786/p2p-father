import { polymarketRelayerService } from "./src/services/relayer";
import { config } from "dotenv";
config();

async function run() {
    const w = await (polymarketRelayerService as any).resolveDepositWallet(0);
    console.log(w);
}
run();
