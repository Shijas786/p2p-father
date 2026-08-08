import { db } from "../src/db/client";

async function main() {
    const supabase = db.getClient();
    const targetAddress = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";

    console.log(`Restoring Shijas (123456789) to original Wallet Index 0: ${targetAddress}...`);

    const { data: updated, error } = await supabase
        .from("users")
        .update({
            wallet_index: 0,
            wallet_address: targetAddress,
            wallet_type: "bot"
        })
        .eq("telegram_id", 123456789)
        .select()
        .single();

    if (error) {
        console.error("Error restoring wallet:", error);
    } else {
        console.log("✅ SUCCESSFULLY RESTORED SHIJAS MASTER WALLET!");
        console.log("User ID:", updated.id);
        console.log("Telegram ID:", updated.telegram_id);
        console.log("WhatsApp Phone:", updated.whatsapp_phone);
        console.log("Wallet Address:", updated.wallet_address);
        console.log("Wallet Index:", updated.wallet_index);
    }
}

main().catch(console.error);
