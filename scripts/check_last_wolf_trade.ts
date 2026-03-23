import { db } from "../src/db/client";

async function main() {
    const client = (db as any).getClient();

    console.log("Searching for user Cryptowolf07...");
    const { data: users } = await client
        .from("users")
        .select("*")
        .ilike("username", "Cryptowolf07");

    if (!users || users.length === 0) {
        console.log("User not found.");
        return;
    }

    const userId = users[0].id;
    console.log(`Found user: ${users[0].username} (${userId})`);

    // Get the most recent completed trade
    const { data: lastTrade } = await client
        .from("trades")
        .select("*, orders(*)")
        .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

    if (!lastTrade) {
        console.log("No completed trades found.");
        return;
    }

    console.log("\n--- Last Completed Trade ---");
    console.log(`Trade ID: ${lastTrade.id}`);
    console.log(`Amount: ${lastTrade.amount}`);
    console.log(`Created At: ${lastTrade.created_at}`);
    console.log(`Order ID: ${lastTrade.order_id}`);
    
    const order = lastTrade.orders;
    console.log("\n--- Associated Order ---");
    console.log(`Order ID: ${order.id}`);
    console.log(`Payment Details: ${JSON.stringify(order.payment_details, null, 2)}`);
    console.log(`Group ID in payment details: ${order.payment_details?.group_id}`);
}

main().catch(console.error);
