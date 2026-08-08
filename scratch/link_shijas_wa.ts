import { db } from "../src/db/client";

async function main() {
    const supabase = db.getClient();

    console.log("Linking WhatsApp LID 101528765505641 to Shijas Telegram Account (123456789)...");

    // 1. Delete any unlinked standalone WA user row for 101528765505641
    await supabase.from("users").delete().eq("whatsapp_phone", "101528765505641");

    // 2. Set whatsapp_phone on Shijas's main Telegram account
    const { data: updated, error } = await supabase
        .from("users")
        .update({ whatsapp_phone: "101528765505641", preferred_channel: "whatsapp" })
        .eq("telegram_id", 123456789)
        .select()
        .single();

    if (error) {
        console.error("Error linking account:", error);
    } else {
        console.log("✅ LINK SUCCESSFUL!");
        console.log("Shijas User ID:", updated.id);
        console.log("Telegram ID:", updated.telegram_id);
        console.log("WhatsApp Phone/LID:", updated.whatsapp_phone);
        console.log("Wallet Address:", updated.wallet_address);
        console.log("Wallet Index:", updated.wallet_index);
    }
}

main().catch(console.error);
