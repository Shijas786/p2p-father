import { db } from "../src/db/client";
import { polymarketService } from "../src/services/polymarket";
import { polymarketRelayerService } from "../src/services/relayer";

async function main() {
    const { data: user } = await db.getClient()
        .from("users")
        .select("*")
        .eq("username", "shijas")
        .single();
        
    if (!user) return;
    
    const depositAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index);
    const positions = await polymarketService.getPositionsForProxy(depositAddress, "0");
    
    console.log("ALL POSITIONS:");
    for (const pos of positions) {
        console.log(`- Title: ${pos.title}, Size: ${pos.size}, Redeemable: ${pos.redeemable}, Asset: ${pos.asset}`);
    }
}

main().catch(console.error);
