import { wallet as walletSvc } from "../src/services/wallet";
import { db } from "../src/db/client";

async function main() {
    const targetAddress = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799".toLowerCase();
    console.log("Searching for wallet index that produces:", targetAddress);

    let foundIndex: number | null = null;
    for (let i = 1; i <= 2000; i++) {
        const addr = walletSvc.deriveWallet(i).address.toLowerCase();
        if (addr === targetAddress) {
            foundIndex = i;
            console.log(`🎯 MATCH FOUND! Wallet Index = ${i} produces ${targetAddress}`);
            break;
        }
    }

    if (foundIndex === null) {
        console.log("Not found in HD wallet derivation indices 1-2000. Checking index 0...");
        if (walletSvc.deriveWallet(0).address.toLowerCase() === targetAddress) {
            foundIndex = 0;
            console.log(`🎯 MATCH FOUND! Wallet Index = 0 produces ${targetAddress}`);
        }
    }

    if (foundIndex !== null) {
        const supabase = db.getClient();
        // Check if any user in DB has wallet_index === foundIndex
        const { data: userWithIndex } = await supabase
            .from("users")
            .select("*")
            .eq("wallet_index", foundIndex);

        console.log(`Users with wallet_index = ${foundIndex}:`, userWithIndex);
    }
}

main().catch(console.error);
