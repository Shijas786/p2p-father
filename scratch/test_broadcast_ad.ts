import { broadcastAd } from "../src/bot/index";
import { db } from "../src/db/client";

async function run() {
    try {
        console.log("Getting a real order and user from DB...");
        const orders = await db.getActiveOrders(undefined, undefined, 1);
        if (orders.length === 0) {
            console.log("No active orders in DB. Creating dummy order & user...");
            const dummyOrder = {
                id: "dummy-id-12345678",
                type: "sell",
                token: "USDC",
                amount: 100,
                filled_amount: 0,
                rate: 90.5,
                payment_methods: ["UPI"],
                username: "dummy_trader",
                trust_score: 95,
                payment_details: {
                    note: "Fast release please!"
                }
            };
            const dummyUser = {
                id: "dummy-user-id",
                first_name: "Dummy",
                username: "dummy_trader"
            };
            console.log("Broadcasting dummy order...");
            await broadcastAd(dummyOrder, dummyUser);
        } else {
            const order = orders[0];
            const user = await db.getUserById(order.user_id);
            console.log("Broadcasting real order:", order.id);
            await broadcastAd(order, user);
        }
        console.log("Done!");
    } catch (err) {
        console.error("Critical error:", err);
    }
}
run();
