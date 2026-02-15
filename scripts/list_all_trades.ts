import { db } from "../src/db/client";

async function main() {
    const client = (db as any).getClient();

    console.log("Fetching all trades...");
    const { data: trades, error } = await client
        .from("trades")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Found ${trades.length} trades.`);
    trades.forEach((t: any) => {
        console.log(`ID: ${t.id} (Short: ${t.id.slice(0, 8)}) | Status: ${t.status} | Amount: ${t.amount} | Created: ${t.created_at}`);
    });
}

main().catch(console.error);
