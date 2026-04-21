
import { db } from "../src/db/client";

async function check() {
    console.log("Checking creators of specific ads...");

    const orderIds = [
        '87232dd2-11cd-4de5-827c-74370713b726',
        'a633003e-c942-4c77-b7aa-f84bb3ab74f6'
    ];

    for (const id of orderIds) {
        const { data: order, error } = await (db as any).getClient()
            .from("orders")
            .select("*, users(id, telegram_id, username, first_name)")
            .eq("id", id)
            .single();

        if (error) {
            console.error(`Error fetching order ${id}:`, error.message);
            continue;
        }

        if (order) {
            const creator = order.users;
            console.log(`\nAd ${id}:`);
            console.log(`  Type: ${order.type} | Amount: ${order.amount} ${order.token} | Rate: ${order.rate}`);
            console.log(`  Created At: ${order.created_at}`);
            console.log(`  Creator: ${creator.username || creator.first_name || 'Anon'} (TG: ${creator.telegram_id})`);
            console.log(`  Status: ${order.status}`);
        } else {
            console.log(`Ad ${id} not found.`);
        }
    }

    console.log("\nDone.");
}

check();
