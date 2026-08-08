import { db } from "../src/db/client";
import { wallet as walletSvc } from "../src/services/wallet";

async function main() {
    const supabase = db.getClient();

    const { data: users, error } = await supabase
        .from("users")
        .select("id, telegram_id, whatsapp_phone, username, first_name, wallet_address, wallet_index, wallet_type")
        .order("wallet_index", { ascending: true });

    if (error) {
        console.error("Error fetching users:", error);
        return;
    }

    console.log(`=======================================================`);
    console.log(`FULL DATABASE INTEGRITY AUDIT: ${users.length} TOTAL USERS`);
    console.log(`=======================================================\n`);

    let invalidCount = 0;
    for (const u of users) {
        if (u.wallet_index === null || !u.wallet_address) {
            console.log(`ℹ️ [UNASSIGNED NEW USER] ID=${u.id} Name=${u.first_name || 'N/A'} Phone=${u.whatsapp_phone || 'N/A'}`);
            continue;
        }

        const expectedAddress = walletSvc.deriveWallet(u.wallet_index).address;
        const matches = expectedAddress.toLowerCase() === u.wallet_address.toLowerCase();

        if (matches) {
            console.log(`✅ [VALID] Index=${u.wallet_index} | TG=${u.telegram_id || 'N/A'} | WA=${u.whatsapp_phone || 'N/A'} | User=${u.username || u.first_name} | Addr=${u.wallet_address}`);
        } else {
            invalidCount++;
            console.error(`❌ [MISMATCH] Index=${u.wallet_index} | Stored=${u.wallet_address} | Expected=${expectedAddress}`);
        }
    }

    console.log(`\n=======================================================`);
    if (invalidCount === 0) {
        console.log(`🎉 INTEGRITY VERIFIED: 100% OF ALL USER WALLETS ARE PERFECT & MATCH HD DERIVATION EXACTLY!`);
    } else {
        console.error(`⚠️ Found ${invalidCount} mismatches!`);
    }
    console.log(`=======================================================`);
}

main().catch(console.error);
