import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

    const { data: orders } = await s.from("orders").select("id, type, token, chain, amount, rate, status, payment_methods, created_at, user_id")
        .eq("status", "active")
        .order("created_at", { ascending: false });

    console.log("═══ ACTIVE ORDERS:", orders?.length || 0, "═══");
    for (const o of (orders || [])) {
        console.log(`  ${o.type.toUpperCase()} ${o.amount} ${o.token} on ${o.chain} @ ₹${o.rate} | Methods: ${JSON.stringify(o.payment_methods)} | ${o.created_at}`);
    }

    // Also check recent non-active
    const { data: recent } = await s.from("orders").select("id, type, token, chain, amount, rate, status, created_at")
        .neq("status", "active")
        .order("created_at", { ascending: false })
        .limit(10);

    console.log("\n═══ RECENT NON-ACTIVE ORDERS (last 10) ═══");
    for (const o of (recent || [])) {
        console.log(`  [${o.status}] ${o.type.toUpperCase()} ${o.amount} ${o.token} on ${o.chain} @ ₹${o.rate} | ${o.created_at}`);
    }
}
main().catch(console.error);
