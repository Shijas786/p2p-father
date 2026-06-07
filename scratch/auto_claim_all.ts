import { ethers } from "ethers";
import "dotenv/config";
import { db } from "../src/db/client";
import { polymarketRelayerService } from "../src/services/relayer";
import { polymarketService } from "../src/services/polymarket";

async function main() {
    const supabase = db.getClient();
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
    console.log(`Scanning all claimable positions for user ${user.username} (Wallet: ${depositAddress})...`);
    
    // Fetch all positions from Polymarket Data API with sizeThreshold = 0
    const positions = await polymarketService.getPositionsForProxy(depositAddress, "0");
    console.log(`Found ${positions.length} total positions in Polymarket data.`);
    
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
    const ctfAddress = ethers.getAddress("0x4d97dcd97ec945f40cf65f87097ace5ea0476045");
    const ctfContract = new ethers.Contract(ctfAddress, [
        "function payoutDenominator(bytes32) view returns (uint256)",
        "function payoutNumerators(bytes32, uint256) view returns (uint256)",
        "function balanceOf(address, uint256) view returns (uint256)",
        "function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)",
        "function getPositionId(address collateralToken, bytes32 collectionId) view returns (uint256)"
    ], provider);
    
    const PUSD = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
    const USDCe = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    
    let totalClaimed = 0;
    
    // De-duplicate positions by condition ID
    const uniqueConditions = Array.from(new Set(positions.map((p: any) => p.conditionId))).filter(Boolean);
    console.log(`De-duplicated to ${uniqueConditions.length} unique market conditions. Checking status on-chain...`);
    
    for (const conditionId of uniqueConditions) {
        try {
            const denominator = await ctfContract.payoutDenominator(conditionId);
            console.log(`- Market ${conditionId}: Denominator = ${denominator.toString()}`);
            if (denominator === 0n) {
                console.log(`  Market is NOT resolved yet. Skipping.`);
                continue;
            }
            
            // Check which outcome won
            const num0 = await ctfContract.payoutNumerators(conditionId, 0);
            const num1 = await ctfContract.payoutNumerators(conditionId, 1);
            console.log(`  Payout Numerators: Outcome 0 (UP) = ${num0.toString()}, Outcome 1 (DOWN) = ${num1.toString()}`);
            
            let winningIndexSet = 0;
            if (num0 > 0n) winningIndexSet = 1;
            else if (num1 > 0n) winningIndexSet = 2;
            
            if (winningIndexSet === 0) {
                console.log(`  Market resolved as a draw or invalid payout. Skipping.`);
                continue;
            }
            
            console.log(`  Winning Index Set: ${winningIndexSet}`);
            
            // Check if the user has a balance in this winning outcome
            const parentCollectionId = "0x0000000000000000000000000000000000000000000000000000000000000000";
            const collectionId = await ctfContract.getCollectionId(parentCollectionId, conditionId, BigInt(winningIndexSet));
            console.log(`  Collection ID: ${collectionId}`);
            
            const tokenIdPUSD = await ctfContract.getPositionId(PUSD, collectionId);
            const tokenIdUSDCE = await ctfContract.getPositionId(USDCe, collectionId);
            console.log(`  Token IDs - pUSD: ${tokenIdPUSD.toString()}, USDCe: ${tokenIdUSDCE.toString()}`);
            
            const balPUSD = await ctfContract.balanceOf(depositAddress, tokenIdPUSD);
            const balUSDCE = await ctfContract.balanceOf(depositAddress, tokenIdUSDCE);
            console.log(`  Balances - pUSD: ${ethers.formatUnits(balPUSD, 6)} shares, USDCe: ${ethers.formatUnits(balUSDCE, 6)} shares`);
            
            const winningBalance = balPUSD > balUSDCE ? balPUSD : balUSDCE;
            
            if (winningBalance === 0n) {
                console.log(`- Market ${conditionId.slice(0, 10)}... User has 0 winning shares (already claimed or didn't win). Skipping.`);
                continue;
            }
            
            const amtStr = ethers.formatUnits(winningBalance, 6);
            console.log(`🚀 Found winning balance for market ${conditionId}: ${amtStr} shares! Redeeming...`);
            
            const txHash = await polymarketRelayerService.redeemPositions(user.wallet_index, conditionId, winningIndexSet);
            console.log(`✅ Successfully redeemed! Tx: ${txHash}`);
            totalClaimed++;
            
            // Update DB trades for this condition to claimed = true
            const { error: dbErr } = await supabase
                .from("prediction_trades")
                .update({ claimed: true, claim_tx_hash: txHash })
                .eq("user_id", user.id)
                .eq("condition_id", conditionId);
                
            if (dbErr) {
                console.warn(`[AutoClaimAll] Failed to update DB for condition ${conditionId}:`, dbErr.message);
            }
        } catch (e: any) {
            console.error(`❌ Failed processing condition ${conditionId}:`, e.message);
        }
    }
    
    console.log(`\n🎉 Scan complete! Redeemed ${totalClaimed} winning markets.`);
    
    // Clear user predictions snapshot caches
    await polymarketService.clearUserPredictionsCache(user.telegram_id);
    polymarketService.clearUserCache(depositAddress);
}

main().catch(console.error);
