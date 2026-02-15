import { db } from "../src/db/client";

async function main() {
    const client = (db as any).getClient();

    console.log("--- Trade #943438fb ---");
    const { data: trade1 } = await client
        .from("trades")
        .select("*")
        .ilike("id", "%943438fb%");
    console.log(JSON.stringify(trade1, null, 2));

    console.log("\n--- Trade #85274da6 ---");
    const { data: trade2 } = await client
        .from("trades")
        .select("*")
        .ilike("id", "%85274da6%");
    console.log(JSON.stringify(trade2, null, 2));
}

main().catch(console.error);
