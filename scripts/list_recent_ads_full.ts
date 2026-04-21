
import { db } from "../src/db/client";

async function check() {
    console.log("Listing all ads created in the last 2 hours...");

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: ads, error } = await (db as any).getClient()
        .from("orders")
        .select("id, user_id, type, amount, token, rate, created_at, users(username, first_name, telegram_id)")
        .gte("created_at", twoHoursAgo)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching ads:", error);
        return;
    }

    console.log(`Found ${ads.length} ads:`);
    ads.forEach((ad: any) => {
        const creator = ad.users;
        console.log(`- Ad ${ad.id} | User: ${creator.username || creator.first_name} (TG: ${creator.telegram_id}) | ${ad.type} | ${ad.amount} ${ad.token} | Created: ${ad.created_at}`);
    });

    console.log("\nDone.");
}

check();
