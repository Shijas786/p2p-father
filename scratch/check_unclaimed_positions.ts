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
    console.log(`Checking all positions (including tiny sizes) for wallet: ${depositAddress}`);
    
    // Call positions API with sizeThreshold = 0 to get all positions
    const positions = await polymarketService.getPositionsForProxy(depositAddress, "0");
    
    console.log(`Found ${positions.length} total positions.`);
    
    const redeemablePositions = positions.filter((pos: any) => pos.redeemable === true && parseFloat(pos.size) > 0);
    console.log(`\nRedeemable (winning) positions found: ${redeemablePositions.length}`);
    for (const pos of redeemablePositions) {
        console.log(`- Title: "${pos.title}"`);
        console.log(`  Outcome: ${pos.outcome} (Asset: ${pos.asset})`);
        console.log(`  Condition ID: ${pos.conditionId}`);
        console.log(`  Size (Shares): ${pos.size}`);
        console.log(`  Current Value: $${pos.currentValue}`);
        console.log(`  Redeemable: ${pos.redeemable}`);
    }
}

main().catch(console.error);
