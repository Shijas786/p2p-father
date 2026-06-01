const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    // Find Spectravein's user ID
    const { data: users, error: userErr } = await supabase
        .from("users")
        .select("id, username, first_name")
        .ilike("username", "Spectravein");

    if (userErr) throw userErr;
    console.log("Users matching 'Spectravein':", users);

    if (users && users.length > 0) {
        const userId = users[0].id;
        // Fetch all orders from this user
        const { data: orders, error: orderErr } = await supabase
            .from("orders")
            .select("*")
            .eq("user_id", userId);

        if (orderErr) throw orderErr;
        console.log(`\nOrders for Spectravein (${userId}):`);
        for (const order of orders) {
            console.log(`- Order: ${order.id}, Amount: ${order.amount}, Status: ${order.status}, Expires At: ${order.expires_at}`);
            
            const { data: broadcasts, error: bErr } = await supabase
                .from("ad_broadcasts")
                .select("*")
                .eq("order_id", order.id);

            if (bErr) throw bErr;
            console.log(`  Broadcasts for this order:`, broadcasts);
        }
    }
}

main().catch(console.error);
