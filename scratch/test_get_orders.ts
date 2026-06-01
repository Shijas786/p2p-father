import { db } from "../src/db/client";

async function run() {
    try {
        console.log("Fetching active orders...");
        const orders = await db.getActiveOrders(undefined, undefined, 10);
        console.log("Success! Found", orders.length, "orders.");
    } catch (err) {
        console.error("Error:", err);
    }
}
run();
