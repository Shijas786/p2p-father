import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

async function checkOrumon() {
    console.log("🔍 Searching for 'orumon' in Supabase database...");

    const { data: users, error } = await supabase
        .from("users")
        .select("*");

    if (error) {
        console.error("Error fetching users:", error);
        return;
    }

    console.log(`Total users in DB: ${users.length}`);

    // Search for username or first_name or any field containing "orum"
    const matched = users.filter((u: any) => {
        const str = JSON.stringify(u).toLowerCase();
        return str.includes("orum") || str.includes("rumon");
    });

    if (matched.length === 0) {
        console.log("⚠️ No user matching 'orumon' found by text search.");
        console.log("Here are some recent users in DB:");
        console.log(users.slice(-10).map((u: any) => ({
            id: u.id,
            telegram_id: u.telegram_id,
            username: u.username,
            first_name: u.first_name,
            wallet_address: u.wallet_address
        })));
    } else {
        console.log(`✅ Found ${matched.length} matching user(s):`);
        console.log(JSON.stringify(matched, null, 2));
    }
}

checkOrumon().catch(console.error);
