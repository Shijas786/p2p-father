
import { db } from "../src/db/client";
import { escrow } from "../src/services/escrow";
import { env } from "../src/config/env";

async function test() {
    const client = (db as any).getClient();
    const userId = "15d42840-0387-4c85-be27-67516e994465"; // Cryptowolf07
    console.log(`Checking orders for ${userId}...`);

    const { data: user } = await client.from("users").select("*").eq("id", userId).single();
    if (!user) {
        console.error("User not found!");
        return;
    }
    console.log(`User: ${user.username} (Wallet: ${user.wallet_address})`);

    const { data: orders } = await client.from("orders").select("*").eq("user_id", userId).neq("status", "cancelled");
    console.log(`Found ${orders?.length || 0} non-cancelled orders:`);

    for (const o of orders || []) {
        console.log(`\n[ORDER] ${o.id}`);
        console.log(` - Type: ${o.type}`);
        console.log(` - Status: ${o.status}`);
        console.log(` - Amount: ${o.amount}`);
        console.log(` - Filled: ${o.filled_amount}`);
        console.log(` - Token: ${o.token} (${o.chain})`);

        // Check Vault balance again
        const vaultBal = await escrow.getVaultBalance(user.wallet_address, env.USDC_ADDRESS, 'base');
        console.log(` - User Vault Balance: ${vaultBal}`);
    }
}

test();
