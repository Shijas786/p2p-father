import { db } from "../src/db/client";
import { polymarketRelayerService } from "../src/services/relayer";
import { polymarketService } from "../src/services/polymarket";
import { ethers } from "ethers";

const targetSlug = "btc-updown-5m-1780532100"; // June 3, 5:35 PM ET
const targetConditionId = "0x67405fbc8945726be558126fcd7b8a5eae83bea9f8f4f71582e3ec2ffafad384";

async function main() {
    const client = db.getClient();
    const { data: users, error } = await client
        .from("users")
        .select("id, telegram_id, username, first_name, wallet_index");

    if (error) {
        console.error("DB Error:", error);
        return;
    }

    console.log(`Checking ${users?.length} users...`);

    for (const user of users || []) {
        try {
            const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index);
            if (!proxyAddress || proxyAddress.includes("Demo")) continue;

            console.log(`User index ${user.wallet_index} (${user.username || user.first_name}): proxy address = ${proxyAddress}`);

            const [trades, positions] = await Promise.all([
                polymarketService.getTradesForProxy(proxyAddress).catch(() => []),
                polymarketService.getPositionsForProxy(proxyAddress).catch(() => [])
            ]);

            const userTargetTrades = trades.filter((t: any) => t.market === targetConditionId || t.slug?.includes(targetSlug) || t.asset_id === "42801116244670265215752174360341775796253457199120970634620023604313589998246" || t.asset_id === "41249767664871465225434151745778848767988383818968988583487313076110825368940");
            const userTargetPositions = positions.filter((p: any) => p.conditionId === targetConditionId);

            if (userTargetTrades.length > 0 || userTargetPositions.length > 0) {
                console.log(`\n======================================================`);
                console.log(`MATCH FOUND FOR USER ${user.username || user.first_name} (TG ID: ${user.telegram_id})`);
                console.log(`Proxy: ${proxyAddress}`);
                console.log(`Trades:`, JSON.stringify(userTargetTrades, null, 2));
                console.log(`Positions:`, JSON.stringify(userTargetPositions, null, 2));
                console.log(`======================================================\n`);
            }
        } catch (err: any) {
            console.error(`Error for user index ${user.wallet_index}:`, err.message);
        }
    }
    console.log("Done checking all users.");
}

main().catch(console.error);
