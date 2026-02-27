import { createClient } from "@supabase/supabase-js";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const ESCROW_ABI = [
    "function trades(uint256) view returns (address seller, address buyer, address token, uint256 amount, uint256 feeAmount, uint256 buyerReceives, uint8 status, uint256 createdAt, uint256 deadline, uint256 fiatSentAt, address disputeInitiator, string disputeReason)",
];

async function main() {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const bscProvider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL!);
    const escrow = new ethers.Contract(process.env.ESCROW_CONTRACT_ADDRESS_BSC!, ESCROW_ABI, bscProvider);

    // The two refunded trades for Prince Althani
    const tradeIds = [
        "b5d5387c-7c2c-4cb3-b98c-8d7deafc90a2",  // approximate - let me fetch properly
        "282b4fc3",
    ];

    // Get both refunded trades involving prince
    const princeId = "eeb5270d-f387-4ce3-944f-a3e1556c931b";

    const { data: refundedTrades } = await supabase
        .from("trades")
        .select("*")
        .or(`buyer_id.eq.${princeId},seller_id.eq.${princeId}`)
        .in("status", ["refunded", "cancelled"])
        .order("created_at", { ascending: false });

    for (const t of (refundedTrades || [])) {
        console.log(`\n════════════════════════════════════════`);
        console.log(`Trade ID: ${t.id}`);
        console.log(`Status: ${t.status}`);
        console.log(`Amount: ${t.amount} ${t.token}`);
        console.log(`Fiat: ₹${t.fiat_amount}`);
        console.log(`Chain: ${t.chain}`);
        console.log(`On-chain Trade ID: ${t.on_chain_trade_id}`);
        console.log(`Created: ${t.created_at}`);
        console.log(`Completed: ${t.completed_at || "N/A"}`);
        console.log(`Escrow TX: ${t.escrow_tx_hash}`);
        console.log(`Release TX: ${t.release_tx_hash || "N/A"}`);
        console.log(`Dispute Reason: ${t.dispute_reason || "N/A"}`);

        // Look up buyer and seller
        const { data: seller } = await supabase.from("users").select("id, username, first_name, wallet_address").eq("id", t.seller_id).single();
        const { data: buyer } = await supabase.from("users").select("id, username, first_name, wallet_address").eq("id", t.buyer_id).single();

        const princeRole = t.buyer_id === princeId ? "BUYER" : "SELLER";
        console.log(`\nPrince's Role: ${princeRole}`);
        console.log(`Seller: @${seller?.username || seller?.first_name || "?"} (${seller?.wallet_address})`);
        console.log(`Buyer:  @${buyer?.username || buyer?.first_name || "?"} (${buyer?.wallet_address})`);

        // Check on-chain state
        if (t.on_chain_trade_id && t.chain === "bsc") {
            try {
                const onChain = await escrow.trades(t.on_chain_trade_id);
                const statusMap: Record<number, string> = { 0: "None", 1: "Active", 2: "FiatSent", 3: "Disputed", 4: "Completed", 5: "Refunded", 6: "Cancelled" };
                console.log(`\n  ON-CHAIN DATA (Trade #${t.on_chain_trade_id}):`);
                console.log(`    Seller: ${onChain.seller}`);
                console.log(`    Buyer:  ${onChain.buyer}`);
                console.log(`    Token:  ${onChain.token}`);
                console.log(`    Amount: ${ethers.formatUnits(onChain.amount, 18)} (raw: ${onChain.amount})`);
                console.log(`    Fee:    ${ethers.formatUnits(onChain.feeAmount, 18)}`);
                console.log(`    Buyer Receives: ${ethers.formatUnits(onChain.buyerReceives, 18)}`);
                console.log(`    Status: ${statusMap[Number(onChain.status)] || onChain.status}`);
                console.log(`    Created: ${new Date(Number(onChain.createdAt) * 1000).toISOString()}`);
                console.log(`    Deadline: ${new Date(Number(onChain.deadline) * 1000).toISOString()}`);
            } catch (e: any) {
                console.log(`  On-chain read error: ${e.message}`);
            }
        }

        // Check payment proofs
        const { data: proofs } = await supabase
            .from("payment_proofs")
            .select("*")
            .eq("trade_id", t.id);

        if (proofs && proofs.length > 0) {
            console.log(`\n  PAYMENT PROOFS:`);
            for (const p of proofs) {
                console.log(`    UTR: ${p.utr} | Amount: ₹${p.amount} | Time: ${p.timestamp}`);
            }
        } else {
            console.log(`\n  No payment proofs submitted.`);
        }
    }
}

main().catch(console.error);
