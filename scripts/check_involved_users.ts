import { db } from "../src/db/client";

async function main() {
    console.log("Checking User 15d42840-0387-4c85-be27-67516e994465...");
    const user = await db.getUserById("15d42840-0387-4c85-be27-67516e994465");
    console.log(JSON.stringify(user, null, 2));

    console.log("\nChecking User 06ae9580-c02a-402e-87da-57034b8a07db...");
    const user2 = await db.getUserById("06ae9580-c02a-402e-87da-57034b8a07db");
    console.log(JSON.stringify(user2, null, 2));

    console.log("\nChecking User c4e7fa14-3d68-463e-8e76-5229f1f1f130...");
    const user3 = await db.getUserById("c4e7fa14-3d68-463e-8e76-5229f1f1f130");
    console.log(JSON.stringify(user3, null, 2));
}

main().catch(console.error);
