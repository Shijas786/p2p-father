import { createClient } from "@supabase/supabase-js";
import { env } from "../src/config/env";

async function main() {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY);

    const { data: users } = await client
        .from("users")
        .select("id, telegram_id, username, first_name, wallet_index, wallet_address, wallet_type")
        .order("wallet_index", { ascending: true });

    if (!users || users.length === 0) {
        console.log("No users found.");
        return;
    }

    console.log(`\n📊 ALL USERS (${users.length} total)\n`);
    console.log("idx | telegram_id     | username          | wallet_index | wallet_address                             | type");
    console.log("--- | --------------- | ----------------- | ------------ | ------------------------------------------ | --------");

    const seenAddresses = new Map<string, string>();
    const seenIndexes = new Map<number, string>();
    let issues = 0;

    for (const u of users) {
        const addr = u.wallet_address || "(none)";
        const shortAddr = addr.length > 10 ? addr.slice(0, 6) + "..." + addr.slice(-4) : addr;
        const isTest = u.username?.startsWith("test_user") || u.telegram_id > 900000 || (u.telegram_id < 1000000 && !u.username);

        let flag = "";

        // Check duplicate address
        if (u.wallet_address && seenAddresses.has(u.wallet_address)) {
            flag += " ⚠️ DUPLICATE ADDR (shared with " + seenAddresses.get(u.wallet_address) + ")";
            issues++;
        }
        if (u.wallet_address) seenAddresses.set(u.wallet_address, u.username || u.id);

        // Check duplicate index
        if (seenIndexes.has(u.wallet_index)) {
            flag += " ⚠️ DUPLICATE INDEX (shared with " + seenIndexes.get(u.wallet_index) + ")";
            issues++;
        }
        seenIndexes.set(u.wallet_index, u.username || u.id);

        if (isTest) flag += " 🧪 TEST";

        console.log(`${String(u.wallet_index).padStart(3)} | ${String(u.telegram_id).padEnd(15)} | ${(u.username || "(no name)").padEnd(17)} | ${String(u.wallet_index).padEnd(12)} | ${shortAddr.padEnd(42)} | ${u.wallet_type || "?"} ${flag}`);
    }

    console.log(`\n${issues === 0 ? "✅ ALL CLEAN — No duplicates found!" : `⚠️ ${issues} ISSUES FOUND!`}`);
    console.log(`Total real users: ${users.filter(u => !u.username?.startsWith("test_user") && u.telegram_id > 1000000).length}`);
}

main().catch(console.error);
