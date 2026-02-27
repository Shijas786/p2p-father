import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

    // Find user by name
    const { data: users } = await supabase
        .from("users")
        .select("*")
        .or("username.ilike.%prince%,first_name.ilike.%prince%,username.ilike.%althani%,first_name.ilike.%althani%");

    if (!users || users.length === 0) {
        console.log("No user found matching 'prince althani'");
        return;
    }

    for (const user of users) {
        console.log("\n═══ USER ═══");
        console.log(`ID: ${user.id}`);
        console.log(`Username: @${user.username || "N/A"}`);
        console.log(`Name: ${user.first_name || ""} ${user.last_name || ""}`);
        console.log(`Telegram ID: ${user.telegram_id}`);
        console.log(`Wallet: ${user.wallet_address}`);
        console.log(`Points: ${user.points || 0}`);
        console.log(`Trade Count: ${user.trade_count || 0}`);
        console.log(`Total Volume: ${user.total_volume || 0}`);
        console.log(`UPI: ${user.upi_id || "N/A"}`);

        // Get trades as buyer
        const { data: buyTrades } = await supabase
            .from("trades")
            .select("*")
            .eq("buyer_id", user.id)
            .order("created_at", { ascending: false });

        // Get trades as seller
        const { data: sellTrades } = await supabase
            .from("trades")
            .select("*")
            .eq("seller_id", user.id)
            .order("created_at", { ascending: false });

        // Get orders
        const { data: orders } = await supabase
            .from("orders")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        console.log(`\n═══ ORDERS (${orders?.length || 0}) ═══`);
        for (const o of (orders || [])) {
            console.log(`  [${o.type.toUpperCase()}] ${o.amount} ${o.token} @ ₹${o.rate} | Status: ${o.status} | Chain: ${o.chain} | ${o.created_at}`);
        }

        console.log(`\n═══ TRADES AS BUYER (${buyTrades?.length || 0}) ═══`);
        for (const t of (buyTrades || [])) {
            console.log(`  Trade ${t.id.slice(0, 8)}... | ${t.amount} ${t.token} | Fiat: ₹${t.fiat_amount} | Status: ${t.status} | Chain: ${t.chain} | On-chain ID: ${t.on_chain_trade_id || "N/A"} | ${t.created_at}`);
            if (t.escrow_tx_hash) console.log(`    Escrow TX: ${t.escrow_tx_hash}`);
            if (t.release_tx_hash) console.log(`    Release TX: ${t.release_tx_hash}`);
        }

        console.log(`\n═══ TRADES AS SELLER (${sellTrades?.length || 0}) ═══`);
        for (const t of (sellTrades || [])) {
            console.log(`  Trade ${t.id.slice(0, 8)}... | ${t.amount} ${t.token} | Fiat: ₹${t.fiat_amount} | Status: ${t.status} | Chain: ${t.chain} | On-chain ID: ${t.on_chain_trade_id || "N/A"} | ${t.created_at}`);
            if (t.escrow_tx_hash) console.log(`    Escrow TX: ${t.escrow_tx_hash}`);
            if (t.release_tx_hash) console.log(`    Release TX: ${t.release_tx_hash}`);
        }
    }
}

main().catch(console.error);
