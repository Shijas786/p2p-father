import { db } from "../src/db/client";

async function main() {
    const client = (db as any).getClient();

    const tradeIds = [
        "4ad3593d-0722-4aa7-b29d-5cb384e63619", // The one that failed
        "4ec762ac-17c0-48d4-9d00-401ce4647855",
        "659fae84-d497-4027-a5e8-bc88e26de289",
        "b67b3f47-7524-49b7-a887-5959e3a35dbc"
    ];

    for (const tradeId of tradeIds) {
        console.log(`\n--- Checking trade ${tradeId} ---`);

        const { data: trade } = await client
            .from("trades")
            .select("*, orders(*)")
            .eq("id", tradeId)
            .single();

        if (!trade) {
            console.log("Trade not found.");
            continue;
        }

        console.log(`Status: ${trade.status}`);
        console.log(`Amount: ${trade.amount}`);
        console.log(`Order Type: ${trade.orders.type}`);
        console.log(`Payment Details: ${JSON.stringify(trade.orders.payment_details, null, 2)}`);
        console.log(`Group ID: ${trade.orders.payment_details?.group_id}`);
    }
}

main().catch(console.error);
