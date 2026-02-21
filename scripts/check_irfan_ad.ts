import { db } from "../src/db/client";

async function main() {
    try {
        const { data: users, error } = await (db as any).getClient()
            .from("users")
            .select("*")
            .or("username.ilike.%irfan%,first_name.ilike.%irfan%");

        if (error) throw error;

        if (!users || users.length === 0) {
            console.log("No user found with name 'Irfan'");
            return;
        }

        for (const user of users) {
            console.log(`\nUser: ${user.first_name} (@${user.username}) [${user.id}]`);

            const { data: orders, error: ordersError } = await (db as any).getClient()
                .from("orders")
                .select("*, created_at, updated_at, expires_at")
                .eq("user_id", user.id);

            if (ordersError) throw ordersError;

            if (!orders || orders.length === 0) {
                console.log("No ads found for this user.");
            } else {
                console.log(`Found ${orders.length} ads:`);
                for (const order of orders) {
                    console.log(`- [${order.id}] ${order.type.toUpperCase()} ${order.amount} ${order.token} on ${order.chain} at ${order.rate} (${order.status})`);
                    console.log(`  Created: ${order.created_at}, Updated: ${order.updated_at}`);

                    if (order.status !== 'active') {
                        // Check if it's filled or cancelled
                        const { data: trades, error: tradesError } = await (db as any).getClient()
                            .from("trades")
                            .select("*")
                            .eq("order_id", order.id);

                        if (tradesError) throw tradesError;
                        if (trades && trades.length > 0) {
                            console.log(`  Linked to ${trades.length} trades:`);
                            for (const trade of trades) {
                                console.log(`    - Trade [${trade.id}]: Status ${trade.status}, Amount ${trade.amount}`);
                            }
                        }
                    }
                }
            }
        }
    } catch (err: any) {
        console.error("Error:", err.message);
    }
}

main();
