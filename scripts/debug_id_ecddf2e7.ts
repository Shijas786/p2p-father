import { db } from "../src/db/client";

async function main() {
    const client = (db as any).getClient();

    console.log("Searching for ID containing 'ecddf2e7' in orders table...");
    const { data: o, error } = await client
        .from("orders")
        .select("*")
        .ilike("id", "%ecddf2e7%");

    if (error) console.error("Error:", error);
    console.log("Orders found:", JSON.stringify(o, null, 2));

    console.log("\nSearching for ID containing 'ecddf2e7' in trades table...");
    const { data: t, error: error2 } = await client
        .from("trades")
        .select("*")
        .ilike("id", "%ecddf2e7%");

    if (error2) console.error("Error:", error2);
    console.log("Trades found:", JSON.stringify(t, null, 2));
}

main().catch(console.error);
