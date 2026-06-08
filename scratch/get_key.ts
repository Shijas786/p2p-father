import { db } from '../src/db/client';
import { wallet } from '../src/services/wallet';

async function main() {
    try {
        const client = db.getClient();
        
        // Let's just fetch all users and filter locally to avoid Supabase syntax errors if column names are slightly different
        const { data, error } = await client.from("users").select("*");
        if (error) throw error;
        
        const target = data.find(u => 
            (u.username && u.username.toLowerCase().includes('gorilla')) || 
            (u.first_name && u.first_name.toLowerCase().includes('gorilla'))
        );
        
        if (!target) {
            console.log("Could not find a user matching gorilla_m1");
            process.exit(1);
        }
        
        console.log(`Found user: ${target.username} (First Name: ${target.first_name}) (ID: ${target.id})`);
        
        const derivedWallet = wallet.deriveWallet(target.wallet_index);
        console.log("Wallet Address:", derivedWallet.address);
        console.log("Private Key:", derivedWallet.privateKey);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

main();
