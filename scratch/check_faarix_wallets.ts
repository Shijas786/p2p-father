
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkWallets() {
    const username = "faarix";
    console.log(`Checking wallets for username: ${username}...`);

    const { data: users, error } = await supabase
        .from("users")
        .select("*")
        .or(`username.ilike.${username},username.ilike.@${username}`);

    if (error) {
        console.error("Error fetching users:", error);
        return;
    }

    if (!users || users.length === 0) {
        console.log("No users found with that username.");
        return;
    }

    console.log(`Found ${users.length} user(s):`);
    users.forEach((user, index) => {
        console.log(`\n--- User ${index + 1} ---`);
        console.log(`ID: ${user.id}`);
        console.log(`Telegram ID: ${user.telegram_id}`);
        console.log(`Username: ${user.username}`);
        console.log(`First Name: ${user.first_name}`);
        console.log(`Bot Wallet Address: ${user.wallet_address}`);
        console.log(`Wallet Index: ${user.wallet_index}`);
        console.log(`Receive Address: ${user.receive_address || "None"}`);
        console.log(`UPI ID: ${user.upi_id || "None"}`);
        console.log(`Bank Details: ${JSON.stringify(user.bank_details)}`);
        console.log(`Digital Rupee ID: ${user.digital_rupee_id || "None"}`);
    });
}

checkWallets().catch(console.error);
