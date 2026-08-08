import { db } from "../src/db/client";

async function main() {
    const client = db.getClient();
    console.log("Cleaning stale whatsapp_auth session keys from Supabase...");
    const { data, error } = await client
        .from("whatsapp_auth")
        .delete()
        .neq("filename", "creds.json");

    if (error) {
        console.error("Error cleaning whatsapp_auth:", error);
    } else {
        console.log("Successfully deleted stale session & pre-keys from Supabase!");
    }
    process.exit(0);
}

main();
