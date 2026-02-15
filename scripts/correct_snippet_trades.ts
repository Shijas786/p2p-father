import { db } from "../src/db/client";

async function main() {
    const client = (db as any).getClient();

    console.log("Correcting trade statuses...");

    // 1. Update #943438fb (the real active trade) to 'in_escrow'
    const { error: error1 } = await client
        .from("trades")
        .update({ status: 'in_escrow' })
        .eq("id", "943438fb-7acb-4b76-abe4-1205c0b6a17b");

    if (error1) console.error("Error updating #943438fb:", error1);
    else console.log("Updated #943438fb to 'in_escrow'");

    // 2. Update #85274da6 (the stale/duplicate) to 'cancelled'
    const { error: error2 } = await client
        .from("trades")
        .update({ status: 'cancelled' })
        .eq("id", "85274da6-9c51-4b13-a55f-dfc31419fa6f");

    if (error2) console.error("Error updating #85274da6:", error2);
    else console.log("Updated #85274da6 to 'cancelled'");
}

main().catch(console.error);
