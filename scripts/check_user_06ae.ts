import { db } from "../src/db/client";

async function main() {
    console.log("Checking User 06ae9580-c02a-402e-87da-57034b8a07db...");
    const user = await db.getUserById("06ae9580-c02a-402e-87da-57034b8a07db");
    console.log(JSON.stringify(user, null, 2));
}

main().catch(console.error);
