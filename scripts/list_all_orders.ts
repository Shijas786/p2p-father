
import { db } from "../src/db/client";

async function main() {
    console.log("--- ALL ORDERS DUMP ---");
    const client = (db as any).getClient();

    // Fetch all orders, newest first
    const { data: orders, error } = await client
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching orders:", error);
        return;
    }

    console.log(`Found ${orders.length} total orders.`);

    for (const o of orders) {
        const { data: user } = await client.from("users").select("username, telegram_id").eq("id", o.user_id).single();
        console.log(`[${o.created_at}] ID:${o.id.slice(0, 8)}... Type:${o.type} Status:${o.status} Amount:${o.amount} Filled:${o.filled_amount} User:${user?.username} (TG:${user?.telegram_id})`);
    }
}

main();
