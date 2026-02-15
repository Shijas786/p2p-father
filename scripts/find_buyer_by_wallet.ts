import { db } from "../src/db/client";

async function main() {
    const client = (db as any).getClient();

    console.log("Searching for user with wallet 0x08FFc32adA724BEAE008f5C08bb1C06c1a737e10...");
    const { data: users } = await client
        .from("users")
        .select("*")
        .eq("wallet_address", "0x08FFc32adA724BEAE008f5C08bb1C06c1a737e10");

    console.log("Users found:", JSON.stringify(users, null, 2));
}

main().catch(console.error);
