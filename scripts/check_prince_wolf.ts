import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const princeId = "eeb5270d-f387-4ce3-944f-a3e1556c931b";

    const { data: wolf } = await supabase.from("users").select("id, username, wallet_address, points, trade_count, total_volume").ilike("username", "%Cryptowolf%");
    if (!wolf || wolf.length === 0) { console.log("Not found"); return; }
    const w = wolf[0];
    console.log("Cryptowolf:", w.username, w.wallet_address, "Points:", w.points, "Trades:", w.trade_count, "Vol:", w.total_volume);

    // Trades where prince=buyer, wolf=seller
    const { data: t1 } = await supabase.from("trades").select("id, amount, token, fiat_amount, rate, status, chain, on_chain_trade_id, created_at, fiat_sent_at, completed_at, escrow_tx_hash, release_tx_hash, dispute_reason, fee_amount, buyer_receives")
        .eq("buyer_id", princeId).eq("seller_id", w.id);

    // Trades where wolf=buyer, prince=seller
    const { data: t2 } = await supabase.from("trades").select("id, amount, token, fiat_amount, rate, status, chain, on_chain_trade_id, created_at, fiat_sent_at, completed_at, escrow_tx_hash, release_tx_hash, dispute_reason, fee_amount, buyer_receives")
        .eq("buyer_id", w.id).eq("seller_id", princeId);

    const all = [...(t1 || []).map(t => ({ ...t, princeRole: 'BUYER' })), ...(t2 || []).map(t => ({ ...t, princeRole: 'SELLER' }))];
    all.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    console.log("\nTrades between them:", all.length);
    for (const t of all) {
        console.log("\n---");
        console.log(t.id, "|", (t as any).princeRole, "|", t.amount, t.token, "| ₹" + t.fiat_amount, "| Status:", t.status);
        console.log("  On-chain:", t.on_chain_trade_id, "| Chain:", t.chain, "| Rate:", t.rate);
        console.log("  Escrow:", t.escrow_tx_hash, "| Release:", t.release_tx_hash || "N/A");
        console.log("  Created:", t.created_at, "| FiatSent:", t.fiat_sent_at || "N/A", "| Done:", t.completed_at || "N/A");
        console.log("  Dispute:", t.dispute_reason || "None");
        console.log("  Fee:", t.fee_amount, "| BuyerReceives:", t.buyer_receives);
    }
}
main().catch(console.error);
