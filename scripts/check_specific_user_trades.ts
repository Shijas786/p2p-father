import { db } from "../src/db/client";

async function main() {
    const userId = process.argv[2];
    if (!userId) {
        console.log("Usage: npx ts-node scripts/check_specific_user_trades.ts <user_id>");
        return;
    }

    const { data: user } = await (db as any).getClient()
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

    if (!user) {
        console.log("User not found.");
        return;
    }

    console.log(`\n═══ USER ${user.username} (ID: ${user.id}) ═══`);

    const { data: trades } = await (db as any).getClient()
        .from("trades")
        .select("*")
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(5);

    console.log(`\nRecent Trades (${trades?.length || 0}):`);
    for (const t of (trades || [])) {
        console.log(`- ID: ${t.id} | Amount: ${t.amount} ${t.token} | Status: ${t.status} | Chain: ${t.chain}`);
        console.log(`  Escrow TX: ${t.escrow_tx_hash}`);
        console.log(`  Release TX: ${t.release_tx_hash}`);
        console.log(`  On-chain ID: ${t.on_chain_trade_id}`);
    }
}

main().catch(console.error);
