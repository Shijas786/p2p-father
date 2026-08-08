import { db } from "../src/db/client";

async function main() {
    const supabase = db.getClient();
    
    // Delete test WA users
    const { data: users } = await supabase
        .from("users")
        .select("id, whatsapp_phone, first_name")
        .eq("whatsapp_phone", "101528765505641");

    console.log("Found test user:", users);

    for (const u of users || []) {
        console.log(`Deleting test user ${u.id} (${u.whatsapp_phone})...`);
        const { error: delErr } = await supabase
            .from("users")
            .delete()
            .eq("id", u.id);

        if (delErr) {
            console.error(`Failed to delete user ${u.id}:`, delErr);
        } else {
            console.log(`✅ Deleted user ${u.id}! Next message will be treated as 100% brand new!`);
        }
    }
}

main().catch(console.error);
