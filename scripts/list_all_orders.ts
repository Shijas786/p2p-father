import { db } from "../src/db/client";

async function main() {
    const client = (db as any).getClient();

    console.log("Fetching all orders...");
    const { data: orders, error } = await client
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Found ${orders.length} orders.`);
    orders.forEach((o: any) => {
        console.log(`ID: ${o.id} (Short: ${o.id.slice(0, 8)}) | Status: ${o.status} | Amount: ${o.amount} | Type: ${o.type} | Created: ${o.created_at}`);
    });
}

main().catch(console.error);
