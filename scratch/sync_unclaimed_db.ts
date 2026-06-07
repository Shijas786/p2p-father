import { ethers } from "ethers";
import "dotenv/config";
import { db } from "../src/db/client";
import { polymarketService } from "../src/services/polymarket";
import { polymarketRelayerService } from "../src/services/relayer";

async function main() {
    const supabase = db.getClient();
    
    // Fetch all prediction trades that are WIN and not claimed in DB
    const { data: trades, error } = await supabase
        .from("prediction_trades")
        .select("*")
        .eq("resolution", "WIN")
        .eq("claimed", false);
        
    if (error || !trades || trades.length === 0) {
        console.log("No WIN unclaimed trades in DB to check.");
        return;
    }
    
    console.log(`Found ${trades.length} WIN unclaimed trades in DB. Fetching active on-chain positions...`);
    
    // Fetch user details to get proxy wallet address
    const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("username", "shijas")
        .single();
        
    if (!user) {
        console.error("User shijas not found");
        return;
    }
    
    const depositAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index);
    
    // Fetch all active positions with sizeThreshold = 0
    const positions = await polymarketService.getPositionsForProxy(depositAddress, "0");
    console.log(`Fetched ${positions.length} active positions from Polymarket.`);
    
    // Create a set of condition IDs where the user has active positive balances
    const activeConditionIds = new Set<string>();
    for (const p of positions) {
        if (p.conditionId && parseFloat(p.size) > 0) {
            activeConditionIds.add(p.conditionId.toLowerCase());
        }
    }
    
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
    const ctfAddress = ethers.getAddress("0x4d97dcd97ec945f40cf65f87097ace5ea0476045");
    const ctfContract = new ethers.Contract(ctfAddress, [
        "function payoutDenominator(bytes32) view returns (uint256)"
    ], provider);
    
    let updatedCount = 0;
    const conditionsChecked = new Map<string, boolean>(); // Cache resolved check to avoid duplicate calls
    
    for (const t of trades) {
        try {
            const conditionId = t.condition_id;
            const conditionIdLc = conditionId.toLowerCase();
            
            // If the condition is in active positions, it means there are still shares left
            if (activeConditionIds.has(conditionIdLc)) {
                console.log(`- Trade ${t.id}: Still has active position on-chain. Skipping update.`);
                continue;
            }
            
            // Check if market is resolved on-chain
            let isResolved = conditionsChecked.get(conditionIdLc);
            if (isResolved === undefined) {
                const denominator = await ctfContract.payoutDenominator(conditionId);
                isResolved = denominator > 0n;
                conditionsChecked.set(conditionIdLc, isResolved);
            }
            
            if (isResolved) {
                console.log(`- Trade ${t.id} (Market: ${conditionId.slice(0, 10)}...): Resolved and has 0 active shares. Marking as claimed in DB.`);
                const { error: updateErr } = await supabase
                    .from("prediction_trades")
                    .update({ claimed: true })
                    .eq("id", t.id);
                    
                if (!updateErr) updatedCount++;
            } else {
                console.log(`- Trade ${t.id}: Market not resolved yet. Skipping.`);
            }
        } catch (err: any) {
            console.error(`Error processing trade ${t.id}:`, err.message);
        }
    }
    
    console.log(`\n🎉 Bulk Sync complete! Updated ${updatedCount} trades to claimed = true in database.`);
}

main().catch(console.error);
