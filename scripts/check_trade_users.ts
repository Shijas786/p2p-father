import { db } from "../src/db/client";

async function main() {
    const client = (db as any).getClient();

    const tradeId = "4ad3593d-0722-4aa7-b29d-5cb384e63619";
    console.log(`Checking trade ${tradeId}...`);

    const { data: trade } = await client
        .from("trades")
        .select("*, seller:users!trades_seller_id_fkey(*), buyer:users!trades_buyer_id_fkey(*), orders(*)")
        .eq("id", tradeId)
        .single();

    if (!trade) {
        console.log("Trade not found.");
        return;
    }

    console.log("\n--- Trade Details ---");
    console.log(`Seller: ${trade.seller.username} (${trade.seller.id})`);
    console.log(`Buyer: ${trade.buyer.username} (${trade.buyer.id})`);
    console.log(`Amount: ${trade.amount}`);
    console.log(`Status: ${trade.status}`);

    console.log("\n--- Order Details ---");
    const order = trade.orders;
    console.log(`Order ID: ${order.id}`);
    console.log(`Order Type: ${order.type}`);
    console.log(`Order User ID: ${order.user_id}`);
    console.log(`Payment Details: ${JSON.stringify(order.payment_details, null, 2)}`);
}

main().catch(console.error);
