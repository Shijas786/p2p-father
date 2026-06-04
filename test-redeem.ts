import { db } from "./src/db/client";
import { polymarketRelayerService } from "./src/services/relayer";
import { polymarketService } from "./src/services/polymarket";

async function run() {
    try {
        const client = db.getClient();
        const { data, error } = await client.from("users").select("telegram_id, wallet_index").limit(10);
        if (!data || data.length === 0) {
            console.log("No users found.");
            return;
        }
        
        console.log("Found users:", data.map((d: any) => d.telegram_id));
        
        for (const user of data) {
            if (user.wallet_index === undefined || user.wallet_index === null) continue;
            console.log(`Checking user wallet_index: ${user.wallet_index}`);
            const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index);
            const positions = await polymarketService.getPositionsForProxy(proxyAddress);
            
            const redeemable = positions.find((p: any) => p.redeemable);
            if (redeemable) {
                console.log("Found redeemable condition ID:", redeemable.conditionId);
                try {
                    const hash = await polymarketRelayerService.redeemPositions(user.wallet_index, redeemable.conditionId);
                    console.log("Redeemed! Hash:", hash);
                } catch (e: any) {
                    console.error("Redeem failed:", e.message || e);
                }
            } else {
                console.log("No redeemable positions found for", proxyAddress);
            }
        }
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
run();
