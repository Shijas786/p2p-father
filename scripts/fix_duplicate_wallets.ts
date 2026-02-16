
import { db } from "../src/db/client";
import { wallet } from "../src/services/wallet";

async function main() {
    console.log("🔍 Checking for duplicate wallet addresses...");

    // Get all users
    const client = (db as any).getClient();
    const { data: users, error } = await client
        .from("users")
        .select("*")
        .order("id", { ascending: true }); // ID 1 is oldest

    if (!users) {
        console.log("No users found.");
        return;
    }

    console.log(`Found ${users.length} users.`);

    // Find max index to start incrementing from
    let maxIndex = 0;
    for (const u of users) {
        if (u.wallet_index > maxIndex) maxIndex = u.wallet_index;
    }
    console.log(`Current Max Wallet Index: ${maxIndex}`);

    // Group by wallet_address
    const walletGroups: Record<string, any[]> = {};
    for (const u of users) {
        // Skip users without wallet address (if any)
        if (!u.wallet_address) continue;

        if (!walletGroups[u.wallet_address]) {
            walletGroups[u.wallet_address] = [];
        }
        walletGroups[u.wallet_address].push(u);
    }

    let fixedCount = 0;

    for (const address in walletGroups) {
        const group = walletGroups[address];
        if (group.length > 1) {
            console.log(`\n⚠️  Duplicate Address Found: ${address} (Shared by ${group.length} users)`);

            // Keep the first one (oldest ID)
            const originalOwner = group[0];
            console.log(`   ✅ Keeping for User ID ${originalOwner.id} (@${originalOwner.username || 'NoUser'})`);

            // Fix the rest
            for (let i = 1; i < group.length; i++) {
                const userToFix = group[i];
                maxIndex++;
                const newIndex = maxIndex;

                console.log(`   🔧 Fixing User ID ${userToFix.id} (@${userToFix.username})... Assigning Index ${newIndex}`);

                try {
                    // Derive new wallet
                    const derived = wallet.deriveWallet(newIndex);

                    // Update DB
                    const { error: updateError } = await client
                        .from("users")
                        .update({
                            wallet_index: newIndex,
                            wallet_address: derived.address,
                            wallet_type: 'bot' // Ensure type is set
                        })
                        .eq("id", userToFix.id);

                    if (updateError) {
                        console.error(`      ❌ Failed to update DB: ${updateError.message}`);
                    } else {
                        console.log(`      ✨ Fixed! New Address: ${derived.address}`);
                        fixedCount++;
                    }
                } catch (err: any) {
                    console.error(`      ❌ Failed to derive/update: ${err.message}`);
                }
            }
        }
    }

    console.log(`\n🎉 Repair Complete. Fixed ${fixedCount} users.`);
}

main().catch(console.error);
