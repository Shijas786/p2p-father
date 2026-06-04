import { db } from "../src/db/client";

const targetAddr = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02".toLowerCase();

async function main() {
    const client = db.getClient();
    const { data: users, error } = await client
        .from("users")
        .select("*");

    if (error) {
        console.error("DB error:", error);
        return;
    }

    const matched = users?.filter((u: any) => 
        u.wallet_address?.toLowerCase() === targetAddr || 
        u.deposit_wallet_address?.toLowerCase() === targetAddr || 
        u.receive_address?.toLowerCase() === targetAddr
    );

    console.log("Matched users:", JSON.stringify(matched, null, 2));
}

main().catch(console.error);
