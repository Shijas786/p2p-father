import { db } from "../src/db/client";

async function main() {
    const client = (db as any).getClient();

    console.log("Listing all trades with on-chain IDs...");
    const { data: trades, error } = await client
        .from("trades")
        .select("id, on_chain_trade_id, status, created_at");

    if (error) {
        console.error("Error:", error);
        return;
    }

    trades.forEach((t: any) => {
        console.log(`DB ID: ${t.id} (Short: ${t.id.slice(0, 8)}) | On-Chain ID: ${t.on_chain_trade_id} | Status: ${t.status} | Created: ${t.created_at}`);
    });
}

main().catch(console.error);
