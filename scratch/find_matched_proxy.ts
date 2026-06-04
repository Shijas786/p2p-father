import { db } from "../src/db/client";
import { polymarketRelayerService } from "../src/services/relayer";

const targetAddr = "0xbd1d8a2e7d15e2e777524f06d58b5b4709579c02".toLowerCase();

async function main() {
    const client = db.getClient();
    const { data: users, error } = await client
        .from("users")
        .select("id, wallet_index, username, first_name");

    if (error) {
        console.error("DB Error:", error);
        return;
    }

    console.log(`Checking ${users?.length} users...`);

    for (const user of users || []) {
        try {
            const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index);
            if (proxyAddress && proxyAddress.toLowerCase() === targetAddr) {
                console.log(`\nMATCH FOUND!`);
                console.log(`User index: ${user.wallet_index}`);
                console.log(`Username: ${user.username}`);
                console.log(`First Name: ${user.first_name}`);
                console.log(`Matched proxy: ${proxyAddress}\n`);
                return;
            }
        } catch (e: any) {
            // Ignore
        }
    }
    console.log("No match found in derived proxy addresses.");
}

main().catch(console.error);
