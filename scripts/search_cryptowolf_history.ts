import { db } from "../src/db/client";

async function main() {
    const client = (db as any).getClient();

    console.log("Searching for user Cryptowolf07...");
    const { data: users } = await client
        .from("users")
        .select("*")
        .ilike("username", "Cryptowolf07");

    console.log("Users found:", JSON.stringify(users, null, 2));

    if (users && users.length > 0) {
        const userId = users[0].id;
        console.log(`\nFetching orders for user ${userId}...`);
        const { data: orders } = await client
            .from("orders")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });

        orders?.forEach((o: any) => {
            console.log(`Order ID: ${o.id} | Status: ${o.status} | Amount: ${o.amount}`);
        });

        console.log(`\nFetching trades (as seller) for user ${userId}...`);
        const { data: sellTrades } = await client
            .from("trades")
            .select("*")
            .eq("seller_id", userId)
            .order("created_at", { ascending: false });

        sellTrades?.forEach((t: any) => {
            console.log(`Trade ID: ${t.id} | Status: ${t.status} | Amount: ${t.amount}`);
        });

        console.log(`\nFetching trades (as buyer) for user ${userId}...`);
        const { data: buyTrades } = await client
            .from("trades")
            .select("*")
            .eq("buyer_id", userId)
            .order("created_at", { ascending: false });

        buyTrades?.forEach((t: any) => {
            console.log(`Trade ID: ${t.id} | Status: ${t.status} | Amount: ${t.amount}`);
        });
    }
}

main().catch(console.error);
