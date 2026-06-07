import { db } from "../src/db/client";
import { polymarketService } from "../src/services/polymarket";
import { polymarketRelayerService } from "../src/services/relayer";
import { refreshUserSnapshotCache } from "../src/api/miniapp";

async function main() {
    const supabase = db.getClient();
    const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("username", "shijas")
        .single();
        
    if (!user) return;
    
    console.log(`Clearing predictions cache for user ${user.username} (Telegram ID: ${user.telegram_id})...`);
    await polymarketService.clearUserPredictionsCache(user.telegram_id);
    
    const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index);
    polymarketService.clearUserCache(proxyAddress);
    console.log(`Positions and trades cache cleared.`);
    
    console.log(`Pre-warming cache now by triggering refreshUserSnapshotCache...`);
    const fresh = await refreshUserSnapshotCache(user, proxyAddress);
    console.log(`Fresh cache generated:`, JSON.stringify(fresh, null, 2));
}

main().catch(console.error);
