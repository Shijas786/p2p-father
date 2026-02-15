import { db } from "../src/db/client";

async function main() {
    const client = (db as any).getClient();

    console.log("Fetching all orders to find ecddf2e7...");
    const { data: o, error } = await client
        .from("orders")
        .select("*");

    if (error) {
        console.error("Error:", error);
        return;
    }

    const matches = o.filter((order: any) => order.id.includes("ecddf2e7"));
    console.log("Matches found:", JSON.stringify(matches, null, 2));
}

main().catch(console.error);
