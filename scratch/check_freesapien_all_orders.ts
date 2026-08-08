import { db } from "../src/db/client";

async function main() {
    const userId = "59368569-4f61-4a19-a2d0-fedeff2fa23c";
    console.log("=== Checking ALL Orders for @freesapien ===");

    const client = (db as any).getClient();
    const { data: orders, error } = await client
        .from("orders")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching orders:", error.message);
        return;
    }

    console.log(`Total orders found for @freesapien: ${orders?.length || 0}`);
    for (const o of (orders || [])) {
        console.log(`\nAd #${o.id}`);
        console.log(`  Type: ${o.type.toUpperCase()} | Token: ${o.token} | Chain: ${o.chain}`);
        console.log(`  Amount: ${o.amount} | Filled: ${o.filled_amount || 0} | Rate: ${o.rate}`);
        console.log(`  Status: ${o.status}`);
        console.log(`  Created: ${o.created_at}`);
        console.log(`  Expires: ${o.expires_at}`);
        console.log(`  Payment Details:`, o.payment_details);
    }
}

main().catch(console.error);
