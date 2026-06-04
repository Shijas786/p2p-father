import { db } from "../src/db/client";

async function main() {
    const client = db.getClient();
    const { data: users, error } = await client
        .from("users")
        .select("*");

    if (error) {
        console.error("DB error:", error);
        return;
    }

    console.log("Total users in DB:", users?.length);
    console.log("Users:", JSON.stringify(users, null, 2));
}

main().catch(console.error);
