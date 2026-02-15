
import { db } from "../src/db/client";
import { escrow } from "../src/services/escrow";
import { env } from "../src/config/env";

async function main() {
    console.log("--- USERS & BALANCES ---");
    const client = (db as any).getClient();

    // 1. List all users
    const { data: users } = await client.from("users").select("*");
    console.log(`Found ${users.length} users:`);
    for (const u of users) {
        console.log(` - ID:${u.id} TG:${u.telegram_id} User:${u.username} Wallet:${u.wallet_address} Type:${u.wallet_type}`);

        // 2. CheckVault Balance for Cryptowolf07
        if (u.telegram_id.toString() === "123456789") {
            const vaultBase = await escrow.getVaultBalance(u.wallet_address, env.USDC_ADDRESS, 'base');
            const vaultBsc = await escrow.getVaultBalance(u.wallet_address, "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", 'bsc');
            console.log(`   [VAULT] Base USDC: ${vaultBase}`);
            console.log(`   [VAULT] BSC USDC: ${vaultBsc}`);
        }
    }
}

main();
