import { db } from "../src/db/client";
import { polymarketRelayerService } from "../src/services/relayer";
import { polymarketService } from "../src/services/polymarket";
import { config } from "dotenv";
config();

async function main() {
    const client = db.getClient();
    
    console.log("Searching for tokyo_mafiaz in users table...");
    
    // 1. Search in users table
    const { data: users, error: userErr } = await client
        .from("users")
        .select("*");
        
    if (userErr) {
        console.error("User query error:", userErr);
    } else {
        console.log(`Total users in DB: ${users?.length}`);
        const matchedUsers = users?.filter(u => {
            const str = JSON.stringify(u).toLowerCase();
            return str.includes("tokyo") || str.includes("mafia") || str.includes("tokyo_mafiaz");
        });
        console.log("Matched Users:", JSON.stringify(matchedUsers, null, 2));

        if (matchedUsers && matchedUsers.length > 0) {
            for (const u of matchedUsers) {
                console.log(`\n---------------- USER ${u.username || u.telegram_id} ----------------`);
                if (u.wallet_index !== undefined && u.wallet_index !== null) {
                    try {
                        const proxyAddress = await polymarketRelayerService.resolveDepositWallet(u.wallet_index);
                        console.log(`Proxy Address for wallet index ${u.wallet_index}: ${proxyAddress}`);
                        
                        const [trades, positions] = await Promise.all([
                            polymarketService.getTradesForProxy(proxyAddress).catch(e => ({ error: e.message })),
                            polymarketService.getPositionsForProxy(proxyAddress).catch(e => ({ error: e.message }))
                        ]);
                        console.log("Polymarket Trades:", JSON.stringify(trades, null, 2));
                        console.log("Polymarket Positions:", JSON.stringify(positions, null, 2));
                    } catch (e: any) {
                        console.error("Error fetching polymarket data for user:", e.message);
                    }
                }
            }
        }
    }

    // 2. Check orders/trades tables in DB
    const tables = ["p2p_orders", "p2p_trades", "trades", "orders", "predictions", "transactions"];
    for (const t of tables) {
        try {
            const { data, error } = await client.from(t).select("*").limit(100);
            if (!error && data) {
                const matches = data.filter(row => JSON.stringify(row).toLowerCase().includes("tokyo"));
                if (matches.length > 0) {
                    console.log(`\nFound matches in table ${t}:`, JSON.stringify(matches, null, 2));
                }
            }
        } catch (e) {
            // table might not exist
        }
    }
}

main().catch(console.error);
