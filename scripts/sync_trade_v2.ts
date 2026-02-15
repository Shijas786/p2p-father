import { db } from "../src/db/client";

async function main() {
    const client = (db as any).getClient();

    // Find correctly
    const { data: orders } = await client
        .from("orders")
        .select("*");

    const order = orders.find((o: any) => o.id.includes("ecddf2e7"));
    if (!order) {
        throw new Error("Order ecddf2e7 not found");
    }

    const order_id = order.id;
    const seller_id = "15d42840-0387-4c85-be27-67516e994465";
    const buyer_id = "c4e7fa14-3d68-463e-8e76-5229f1f1f130";
    const tradeAmount = 1.0;
    const rate = 94;
    const fiatAmount = 94;
    const feeAmount = 0.01;
    const buyerReceives = 0.99;
    const onChainTradeId = "2";
    const escrowTxHash = "relayed_2";

    console.log(`Syncing Trade for Order ${order_id} (Current status: ${order.status})...`);

    // 1. Mark Order as filled
    const { error: updateError } = await client
        .from("orders")
        .update({ status: "filled", filled_amount: tradeAmount })
        .eq("id", order_id);

    if (updateError) console.error("Order update error:", updateError);
    else console.log("Order updated to 'filled'");

    // 2. Create Trade
    // Check if trade already exists to avoid conflict
    const { data: existingTrade } = await client
        .from("trades")
        .select("*")
        .eq("on_chain_trade_id", onChainTradeId);

    if (existingTrade && existingTrade.length > 0) {
        console.log("Trade already exists in DB:", existingTrade[0].id);
        return;
    }

    const trade = await db.createTrade({
        order_id,
        seller_id,
        buyer_id,
        amount: tradeAmount,
        token: "USDC",
        fiat_amount: fiatAmount as any,
        fiat_currency: "INR",
        rate: rate,
        status: "in_escrow",
        fee_amount: feeAmount as any,
        fee_percentage: 0.01 as any,
        buyer_receives: buyerReceives as any,
        escrow_tx_hash: escrowTxHash as any,
        on_chain_trade_id: onChainTradeId as any,
        escrow_locked_at: new Date().toISOString() as any,
        chain: "base",
    });

    console.log("Trade created in DB:", JSON.stringify(trade, null, 2));
}

main().catch(console.error);
