
import { db } from "../src/db/client";

async function main() {
    console.log("Checking wallet_index behavior...");

    const uniqueId1 = Math.floor(Math.random() * 1000000);
    const uniqueId2 = Math.floor(Math.random() * 1000000);

    console.log(`Creating user 1 with ID: ${uniqueId1}`);
    const user1 = await db.getOrCreateUser(uniqueId1, "test_user_1");
    console.log(`User 1 created. Wallet Index: ${user1.wallet_index}, Wallet Address: ${user1.wallet_address}`);

    console.log(`Creating user 2 with ID: ${uniqueId2}`);
    const user2 = await db.getOrCreateUser(uniqueId2, "test_user_2");
    console.log(`User 2 created. Wallet Index: ${user2.wallet_index}, Wallet Address: ${user2.wallet_address}`);

    if (user1.wallet_index === user2.wallet_index) {
        console.error("CRITICAL: wallet_index is identical!");
    } else {
        console.log(`SUCCESS: wallet_index is unique. (${user1.wallet_index} vs ${user2.wallet_index})`);
    }
}

main().catch(console.error);
