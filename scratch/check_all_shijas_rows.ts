import { db } from "../src/db/client";

async function main() {
    const supabase = db.getClient();

    const { data: rows, error } = await supabase
        .from("users")
        .select("id, telegram_id, whatsapp_phone, username, first_name, wallet_address, wallet_index")
        .or("telegram_id.eq.123456789,whatsapp_phone.eq.101528765505641,username.eq.shijas");

    console.log("ALL matching rows for Shijas:", rows);
}

main().catch(console.error);
