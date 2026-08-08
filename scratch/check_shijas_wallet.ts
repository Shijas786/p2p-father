import { db } from "../src/db/client";

async function main() {
    const supabase = db.getClient();

    const { data: users, error } = await supabase
        .from("users")
        .select("id, telegram_id, whatsapp_phone, username, first_name, wallet_address, wallet_index, wallet_type")
        .or("telegram_id.eq.123456789,username.ilike.%shijas%,whatsapp_phone.eq.101528765505641");

    console.log("Found matching users:", users);

    const { data: allUsers } = await supabase
        .from("users")
        .select("id, telegram_id, whatsapp_phone, username, first_name, wallet_address, wallet_index")
        .order("created_at", { ascending: false })
        .limit(10);

    console.log("Recent 10 users:", allUsers);
}

main().catch(console.error);
