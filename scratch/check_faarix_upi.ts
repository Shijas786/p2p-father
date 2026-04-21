
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

async function checkUPI() {
    const upi = "farispangode123-1@okhdfcbank";
    console.log(`Searching for other users with UPI: ${upi}...`);

    const { data: users, error } = await supabase
        .from("users")
        .select("*")
        .eq("upi_id", upi);

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Found ${users.length} user(s) with this UPI:`);
    for (const user of users) {
        console.log(`\nUser: ${user.username} (${user.first_name})`);
        console.log(`Telegram ID: ${user.telegram_id}`);
        console.log(`Bot Wallet: ${user.wallet_address}`);
    }
}

checkUPI().catch(console.error);
