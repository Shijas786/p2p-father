import { db } from "../src/db/client";

async function disconnectWhatsApp() {
    console.log("Disconnecting WhatsApp and purging all session credentials from Supabase...");
    const client = db.getClient();
    const { error } = await client.from("whatsapp_auth").delete().neq("filename", "");
    if (error) {
        console.error("Error wiping whatsapp_auth:", error);
    } else {
        console.log("✅ Successfully purged all WhatsApp session credentials from Supabase!");
    }
    process.exit(0);
}

disconnectWhatsApp();
