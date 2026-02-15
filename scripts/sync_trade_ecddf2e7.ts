import { db } from "../src/db/client";

async function main() {
    const order_id = "ecddf2e7-f131-4191-8cdb-7ffef18fd822";
    const seller_id = "15d42840-0387-4c85-be27-67516e994465";
    const buyer_id = "c4e7fa14-3d68-463e-8e76-5229f1f1f130";
    const tradeAmount = 1.0;
    const rate = 94;
    const fiatAmount = 94;
    const feeAmount = 0.01; // 1%
    const buyerReceives = 0.99;
    const onChainTradeId = "2";
    const escrowTxHash = "relayed_2"; // Synthetic hash as used in code

    console.log(`Syncing Trade for Order ${order_id}...`);

    // 1. Mark Order as filled
    // Using fillOrder might fail if it's already considered "active", but let's just force update if needed
    const { data: order } = await (db as any).getClient()
        .from("orders")
        .update({ status: "filled", filled_amount: tradeAmount })
        .eq("id", order_id)
        .select();

    console.log("Order updated:", JSON.stringify(order, null, 2));

    // 2. Create Trade
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
