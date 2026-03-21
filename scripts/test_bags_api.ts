import { BagsService } from "../src/services/bags";
import dotenv from "dotenv";
import path from "path";

// Load .env explicitly for the script
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function test() {
    const bags = new BagsService();
    // Using $NYAN token mint for testing
    const testMint = "CMx7yon2cLzHcXqgHsKJhuU3MmME6noWLQk2rAycBAGS";
    
    console.log(`\n🚀 Testing BagsService with mint: ${testMint}`);
    
    try {
        console.log("--- Pool State ---");
        const pool = await bags.getPoolState(testMint);
        console.log(JSON.stringify(pool, null, 2));

        console.log("\n--- Lifetime Fees ---");
        const fees = await bags.getLifetimeFees(testMint);
        console.log(`Total Fees: $${fees}`);

        console.log("\n--- Consolidated Stats ---");
        const stats = await bags.getConsolidatedStats(testMint);
        console.log(JSON.stringify(stats, null, 2));

        if (stats) {
            console.log("\n✅ API Verification Successful!");
        } else {
            console.error("\n❌ API Verification Failed: No stats returned.");
        }
    } catch (err: any) {
        console.error("\n❌ Test Error:", err.message);
    }
}

test();
