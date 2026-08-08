const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const targetTelegramId = 8867497258;
  const targetUpi = "sathium@fam";

  console.log(`Targeting Trader with Telegram ID ${targetTelegramId} & UPI ${targetUpi}...`);

  // 1. Find all users matching Telegram ID or UPI
  const { data: users, error: findErr } = await supabase
    .from("users")
    .select("*")
    .or(`telegram_id.eq.${targetTelegramId},upi_id.ilike.%${targetUpi}%`);

  if (findErr) {
    console.error("Error finding user:", findErr);
    process.exit(1);
  }

  console.log(`Found ${users?.length || 0} user record(s) to ban:`);
  console.log(JSON.stringify(users, null, 2));

  if (!users || users.length === 0) {
    console.log("No user found matching criteria.");
    return;
  }

  const userIds = users.map(u => u.id);

  // 2. Ban the user(s) in DB
  const { data: updatedUsers, error: banErr } = await supabase
    .from("users")
    .update({
      is_banned: true,
      updated_at: new Date().toISOString()
    })
    .in("id", userIds)
    .select();

  if (banErr) {
    console.error("Error setting is_banned=true:", banErr);
  } else {
    console.log("✅ Successfully updated is_banned=true for users:", updatedUsers);
  }

  // 3. Cancel any active orders posted by these users
  const { data: cancelledOrders, error: orderErr } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString()
    })
    .in("user_id", userIds)
    .eq("status", "active")
    .select();

  if (orderErr) {
    console.error("Error cancelling active orders:", orderErr);
  } else {
    console.log(`✅ Cancelled ${cancelledOrders?.length || 0} active order(s) for banned user(s).`);
  }

  // 4. Record Admin Action Log
  try {
    await supabase.from("admin_logs").insert([
      {
        admin_telegram_id: 123456789,
        action: "BAN_USER_AND_UPI",
        details: {
          banned_user_ids: userIds,
          target_telegram_id: targetTelegramId,
          target_upi: targetUpi,
          timestamp: new Date().toISOString()
        }
      }
    ]);
    console.log("✅ Logged ban event to admin_logs.");
  } catch (e) {
    console.log("Admin log warning:", e.message);
  }

  // 5. Verify final status
  const { data: verifyUsers } = await supabase
    .from("users")
    .select("id, telegram_id, username, first_name, upi_id, is_banned")
    .in("id", userIds);

  console.log("\n=== VERIFICATION RESULT ===");
  console.log(JSON.stringify(verifyUsers, null, 2));
}

main().catch(console.error);
