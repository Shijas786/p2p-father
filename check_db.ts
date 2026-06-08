import { db } from "./src/db/client";
import { config } from "dotenv";
config();

async function main() {
    const supabase = (db as any).getClient();
    const { data, error } = await supabase.from('users').select('polymarket_api_key, polymarket_secret, polymarket_passphrase, deposit_wallet_address, polymarket_approved').limit(1);
    console.log("DB check result:", { data, error });
    process.exit(0);
}
main();
