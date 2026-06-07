import { db } from "../src/db/client";
import { polymarketRelayerService } from "../src/services/relayer";

async function main() {
    const { data: user } = await db.getClient()
        .from("users")
        .select("*")
        .eq("username", "shijas")
        .single();
        
    if (!user) return;
    
    // Let's try to redeem for the current condition ID (0xbcdb944cd709578c08510b2d83f3d8067541602dfb7a7ea42369781dab75b630)
    // Outcome index was 0 (Up), which resolved as winning. So indexSet = 1.
    const conditionId = "0xbcdb944cd709578c08510b2d83f3d8067541602dfb7a7ea42369781dab75b630";
    const indexSet = 1;
    
    console.log(`Manually calling redeemPositions for user ${user.username} (index: ${user.wallet_index})`);
    console.log(`Condition: ${conditionId}, indexSet: ${indexSet}`);
    
    try {
        const txHash = await polymarketRelayerService.redeemPositions(user.wallet_index, conditionId, indexSet);
        console.log(`✅ Redeem succeeded! Tx Hash: ${txHash}`);
    } catch (e: any) {
        console.error(`❌ Redeem failed:`, e);
    }
}

main().catch(console.error);
