import { db } from "../src/db/client";

async function main() {
    const client = (db as any).getClient();

    console.log("--- Searching for #ecddf2e7 ---");

    // Check Orders
    const { data: orders } = await client
        .from("orders")
        .select("*")
        .ilike("id", "%ecddf2e7%");

    console.log("Orders found:", JSON.stringify(orders, null, 2));

    // Check Trades
    const { data: trades } = await client
        .from("trades")
        .select("*")
        .ilike("id", "%ecddf2e7%");

    console.log("\nTrades found:", JSON.stringify(trades, null, 2));
}

main().catch(console.error);
