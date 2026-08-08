import { db } from "../src/db/client";
import { polymarketRelayerService } from "../src/services/relayer";
import { polymarketService } from "../src/services/polymarket";
import { config } from "dotenv";
config();

async function main() {
    const user = await db.getUserByTelegramId(123456789);
    if (!user) {
        console.error("User not found");
        process.exit(1);
    }

    const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index, (user as any).deposit_wallet_address);
    if (!proxyAddress) {
        console.error("Proxy address not resolved");
        process.exit(1);
    }

    // Bypass caches
    polymarketService.clearUserCache(proxyAddress);

    console.log("Fetching positions from Polymarket API...");
    const positions = await polymarketService.getPositionsForProxy(proxyAddress);
    const activePositions = positions.filter((p: any) => parseFloat(p.size) > 0 && !p.redeemable);
    
    console.log("Active Polymarket API Positions:");
    for (const p of activePositions) {
        console.log(`  Title: ${p.title} | Size: ${p.size} | AvgPrice: ${p.avgPrice} | InitialValue: ${p.initialValue} | Asset: ${p.asset}`);
    }

    // Print trades for active assets
    const activeAssets = activePositions.map((p: any) => p.asset.toLowerCase());
    const trades = await polymarketService.getTradesForProxy(proxyAddress);
    console.log("\nTrades for active assets:");
    for (const t of trades) {
        const asset = (t.asset_id || t.asset || "").toLowerCase();
        if (activeAssets.includes(asset)) {
            console.log(`  Side: ${t.side} | Size: ${t.size} | Price: ${t.price} | Date: ${new Date((t.timestamp || t.time) * 1000).toISOString()}`);
        }
    }

    process.exit(0);
}

main().catch(console.error);
