
import { db } from "../src/db/client";

async function check() {
    console.log("Checking for duplicate ad creations...");

    // Find users who created multiple ads within 10 seconds of each other
    const { data: ads, error } = await (db as any).getClient()
        .from("orders")
        .select("id, user_id, type, amount, token, rate, created_at")
        .order("created_at", { ascending: false })
        .limit(20);

    if (error) {
        console.error("Error fetching ads:", error);
        return;
    }

    for (let i = 0; i < ads.length - 1; i++) {
        const ad1 = ads[i];
        const ad2 = ads[i+1];

        const t1 = new Date(ad1.created_at).getTime();
        const t2 = new Date(ad2.created_at).getTime();

        if (ad1.user_id === ad2.user_id && Math.abs(t1 - t2) < 10000) {
            console.log(`\n[DUPLICATE AD DETECTED]`);
            console.log(`  User: ${ad1.user_id}`);
            console.log(`  Ad 1: ${ad1.id} | ${ad1.type} | ${ad1.amount} | ${ad1.created_at}`);
            console.log(`  Ad 2: ${ad2.id} | ${ad2.type} | ${ad2.amount} | ${ad2.created_at}`);
            console.log(`  Time diff: ${Math.abs(t1 - t2)}ms`);
        }
    }

    console.log("\nRecent Ads List:");
    ads.forEach(ad => {
        console.log(`  ${ad.id.slice(0, 8)} | User: ${ad.user_id.slice(0, 8)} | ${ad.type} | ${ad.amount} | ${ad.created_at}`);
    });

    console.log("\nDone.");
}

check();
