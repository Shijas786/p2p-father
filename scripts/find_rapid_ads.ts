
import { db } from "../src/db/client";

async function check() {
    console.log("Checking for ads created within 2 seconds of each other by the same user...");

    const { data: ads, error } = await (db as any).getClient()
        .from("orders")
        .select("id, user_id, type, amount, token, rate, created_at, users(username, first_name, telegram_id)")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching ads:", error);
        return;
    }

    let found = false;
    for (let i = 0; i < ads.length - 1; i++) {
        const ad1 = ads[i];
        const ad2 = ads[i+1];

        const t1 = new Date(ad1.created_at).getTime();
        const t2 = new Date(ad2.created_at).getTime();
        const diff = Math.abs(t1 - t2);

        if (ad1.user_id === ad2.user_id && diff < 2000) {
            found = true;
            const creator = ad1.users;
            console.log(`\n[DOUBLE-CLICK AD DETECTED]`);
            console.log(`  User: ${creator.username || creator.first_name} (TG: ${creator.telegram_id})`);
            console.log(`  Ad 1: ${ad1.id} | ${ad1.type} | ${ad1.amount} | ${ad1.created_at}`);
            console.log(`  Ad 2: ${ad2.id} | ${ad2.type} | ${ad2.amount} | ${ad2.created_at}`);
            console.log(`  Time diff: ${diff}ms`);
        }
    }

    if (!found) {
        console.log("No ads found created within 2 seconds of each other.");
    }

    console.log("\nDone.");
}

check();
