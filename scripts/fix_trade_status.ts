import { db } from "../src/db/client";

async function main() {
    // 1. Find the trade for Trade ID 1 (on-chain)
    const client = (db as any).getClient();
    const { data: trades, error: fetchError } = await client
        .from("trades")
        .select("*")
        .eq("on_chain_trade_id", 1);

    if (fetchError) {
        console.error("Error fetching trade:", fetchError);
        return;
    }

    if (!trades || trades.length === 0) {
        console.error("Trade ID 1 not found in DB");
        return;
    }

    const trade = trades[0];
    console.log(`Found Trade: ${trade.id} current status: ${trade.status}`);

    // 2. Update status to 'in_escrow'
    const { error: updateError } = await client
        .from("trades")
        .update({ status: 'in_escrow' })
        .eq("id", trade.id);

    if (updateError) {
        console.error("Error updating trade:", updateError);
    } else {
        console.log(`Successfully updated trade ${trade.id} to 'in_escrow'`);
    }

    // 3. Update associated order to 'filled' just in case (we did this manually but double check)
    const { error: orderError } = await client
        .from("orders")
        .update({ status: 'filled' })
        .eq("id", trade.order_id);

    if (orderError) {
        console.error("Error updating order:", orderError);
    } else {
        console.log(`Ensured order ${trade.order_id} is 'filled'`);
    }
}

main().catch(console.error);
