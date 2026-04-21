
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

async function checkMore() {
    console.log("Searching for alternative entries for faarix...");
    
    // Search by telegram ID and partial names
    const { data: users, error } = await supabase
        .from("users")
        .select("*")
        .or('username.ilike.%faarix%,first_name.ilike.%faarix%,telegram_id.eq.5036584001');

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Found ${users.length} user(s):`);
    for (const user of users) {
        console.log(`\nUser: ${user.username} (${user.first_name})`);
        console.log(`Telegram ID: ${user.telegram_id}`);
        console.log(`Bot Wallet: ${user.wallet_address}`);
        console.log(`Receive Address: ${user.receive_address}`);
        console.log(`UPI: ${user.upi_id}`);
    }
}

checkMore().catch(console.error);
