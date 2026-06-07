import { db } from "../src/db/client";
import { polymarketRelayerService } from "../src/services/relayer";

async function main() {
    const { data: user } = await db.getClient()
        .from("users")
        .select("*")
        .eq("username", "shijas")
        .single();
        
    if (!user) return;
    
    const balance = await polymarketRelayerService.getPusdBalance(user.wallet_index);
    const depositAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index);
    console.log(`User: ${user.username}`);
    console.log(`Deposit Address: ${depositAddress}`);
    console.log(`pUSD Balance: $${balance}`);
}

main().catch(console.error);
