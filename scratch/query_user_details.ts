import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

async function main() {
    const { data: users, error } = await supabase
        .from("users")
        .select("id, telegram_id, username, first_name, wallet_address, wallet_type")
        .or("username.ilike.%gorilla%,first_name.ilike.%gorilla%");

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log("Found matching users:");
    console.log(JSON.stringify(users, null, 2));
}

main().catch(console.error);
