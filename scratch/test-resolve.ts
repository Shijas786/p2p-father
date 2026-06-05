import { polymarketRelayerService } from "../src/services/relayer";

async function run() {
    try {
        const proxyAddress = await polymarketRelayerService.resolveDepositWallet(0);
        console.log("Wallet Index 0 resolved to:", proxyAddress);
    } catch (e: any) {
        console.log("Error:", e.message);
    }
}
run();
