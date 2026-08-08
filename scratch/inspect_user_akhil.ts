import { db } from "../src/db/client";

async function main() {
    const supabase = db.getClient();

    const { data: users, error } = await supabase
        .from("users")
        .select("*")
        .or("username.ilike.%akhil%,first_name.ilike.%akhil%");

    console.log("Found users for Akhil:", users);

    if (users && users.length > 0) {
        for (const u of users) {
            const { data: orders } = await supabase
                .from("orders")
                .select("*")
                .eq("user_id", u.id);
            console.log(`Orders for ${u.username || u.first_name} (${u.id}):`, orders);
        }
    }
}

main().catch(console.error);
