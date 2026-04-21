
import { db } from "../src/db/client";

async function check() {
    console.log("Listing last 10 trades...");

    const { data: trades, error } = await (db as any).getClient()
        .from("trades")
        .select("id, on_chain_trade_id, amount, status, buyer_id, seller_id, order_id, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error fetching trades:", error);
        return;
    }

    trades.forEach((t: any) => {
        console.log(`Trade ${t.id} (On-Chain ID: ${t.on_chain_trade_id}) | Ad: ${t.order_id} | Amount: ${t.amount} | Buyer: ${t.buyer_id} | Status: ${t.status} | Created: ${t.created_at}`);
    });

    console.log("\nDone.");
}

check();
