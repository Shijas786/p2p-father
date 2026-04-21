
import { db } from "../src/db/client";

async function check() {
    console.log("Checking for any two ads created within 1 second of each other (regardless of user)...");

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

        if (diff < 1000) {
            found = true;
            console.log(`\n[COINCIDENT ADS DETECTED]`);
            console.log(`  Diff: ${diff}ms`);
            console.log(`  Ad 1: ${ad1.id} | User: ${ad1.users.username || ad1.users.first_name} | ${ad1.created_at}`);
            console.log(`  Ad 2: ${ad2.id} | User: ${ad2.users.username || ad2.users.first_name} | ${ad2.created_at}`);
        }
    }

    if (!found) {
        console.log("No ads found created within 1 second of each other.");
    }

    console.log("\nDone.");
}

check();
