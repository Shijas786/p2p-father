import { db } from "../src/db/client";

async function main() {
    const supabase = db.getClient();

    const { data: users, error } = await supabase
        .from("users")
        .select("*")
        .eq("wallet_address", "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799");

    console.log("Found user with 0x365d1970c1453bfB446F3fa57Ff440c05c2A5799:", users);

    // Also search case-insensitively or by substring
    const { data: usersIlike } = await supabase
        .from("users")
        .select("id, telegram_id, whatsapp_phone, username, first_name, wallet_address, wallet_index")
        .ilike("wallet_address", "%365d1970c1453bfB446F3fa57Ff440c05c2A5799%");

    console.log("Ilike search result:", usersIlike);
}

main().catch(console.error);
