import { db } from "../src/db/client";

async function main() {
    const client = (db as any).getClient();

    console.log("Checking trade details...");
    const { data: trades, error } = await client
        .from("trades")
        .select("*")
        .in("id", ["943438fb-7acb-4b76-abe4-1205c0b6a17b", "85274da6-9c51-4b13-a55f-dfc31419fa6f"]);

    if (error) {
        console.error("Error:", error);
        return;
    }

    trades.forEach((t: any) => {
        console.log(`\nID: ${t.id} (Short: ${t.id.slice(0, 8)})`);
        console.log(`Status: ${t.status}`);
        console.log(`On-chain ID: ${t.on_chain_trade_id}`);
        console.log(`Chain: ${t.chain}`);
        console.log(`Amount: ${t.amount}`);
        console.log(`Seller ID: ${t.seller_id}`);
        console.log(`Buyer ID: ${t.buyer_id}`);
    });
}

main().catch(console.error);
