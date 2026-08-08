import { db } from "../src/db/client";

async function main() {
    const supabase = db.getClient();

    const target = "0x39a4844112E6b294aFF06dDF6418a8D1F2FdffB7";

    const { data: userByAddr } = await supabase
        .from("users")
        .select("*")
        .ilike("wallet_address", target);

    console.log(`Searching for address ${target}:`, userByAddr);

    const { data: shijasUsers } = await supabase
        .from("users")
        .select("*")
        .or("telegram_id.eq.123456789,whatsapp_phone.eq.101528765505641");

    console.log("All Shijas user rows in DB:", shijasUsers);
}

main().catch(console.error);
