
import { db } from "../src/db/client";

async function check() {
    console.log("Checking for duplicate trades or over-filled orders...");

    // 1. Find all orders with more than one trade or filled_amount > amount
    const { data: orders, error } = await (db as any).getClient()
        .from("orders")
        .select("id, amount, filled_amount, status, type, token, user_id")
        .neq("status", "cancelled");

    if (error) {
        console.error("Error fetching orders:", error);
        return;
    }

    for (const order of orders) {
        const { data: trades, error: tError } = await (db as any).getClient()
            .from("trades")
            .select("id, amount, status, buyer_id, created_at")
            .eq("order_id", order.id);

        if (tError) continue;

        if (trades.length > 1) {
            console.log(`\n[ORDER] ${order.id} has ${trades.length} trades!`);
            console.log(`  Ad Amount: ${order.amount} ${order.token}`);
            console.log(`  Filled: ${order.filled_amount} (Status: ${order.status})`);
            trades.forEach((t: any) => {
                console.log(`  - Trade ${t.id}: ${t.amount} ${order.token} | Buyer: ${t.buyer_id} | Status: ${t.status} | Created: ${t.created_at}`);
            });

            if (order.amount < trades.reduce((sum: number, t: any) => sum + (t.amount || 0), 0)) {
                console.warn(`  ⚠️ CRITICAL: Order is OVER-FILLED!`);
            }
        }
    }

    console.log("\nDone.");
}

check();
