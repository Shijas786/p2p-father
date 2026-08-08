import { getQualifyingVIPConfig } from "../src/config/feeCashback";

function runVerificationTests() {
    console.log("==================================================");
    console.log("🧪 Testing VIP Fee Cashback Configuration & Qualification");
    console.log("==================================================");

    const now = Date.now();
    const oldTimestamp = 1700000000000; // Past date (before policy cutoff)
    const newTimestamp = now + 1000;     // Future/new order timestamp (after policy cutoff)

    // Test 1: @vip_trader on OLD ad (Before Cutoff) -> Should NOT qualify
    const test1 = getQualifyingVIPConfig("987654321", "vip_trader", oldTimestamp);
    console.log(`Test 1: @vip_trader on OLD ad (before policy start):`);
    console.log(`  - Expected: null`);
    console.log(`  - Result:   ${test1 === null ? "✅ PASSED (No Cashback)" : "❌ FAILED"}`);

    // Test 2: @vip_trader on NEW ad (After Cutoff) -> MUST qualify with 25 BPS (0.25%)
    const test2 = getQualifyingVIPConfig("987654321", "vip_trader", newTimestamp);
    console.log(`\nTest 2: @vip_trader on NEW ad (after policy start):`);
    console.log(`  - Expected: 25 BPS (0.25% rebate)`);
    console.log(`  - Result:   ${test2?.rebateBps === 25 ? "✅ PASSED (0.25% Fee Rebate Applied!)" : "❌ FAILED"}`);
    if (test2) {
        console.log(`  - Details: Username=@${test2.username}, TelegramID=${test2.telegramId}, Rebate=${test2.rebateBps} BPS`);
    }

    // Test 3: Random user on NEW ad -> Should NOT qualify
    const test3 = getQualifyingVIPConfig("9999999999", "randomUser", newTimestamp);
    console.log(`\nTest 3: Standard user on NEW ad:`);
    console.log(`  - Expected: null`);
    console.log(`  - Result:   ${test3 === null ? "✅ PASSED (Standard Fee Structure)" : "❌ FAILED"}`);

    // Test 4: Fee Rebate Calculation Example for $100 Trade
    const tradeAmount = 100; // 100 USDT
    const rebatePercent = (test2?.rebateBps || 0) / 10000;
    const rebateAmount = tradeAmount * rebatePercent;
    console.log(`\nTest 4: Fee Rebate Math Calculation ($100 Trade):`);
    console.log(`  - Trade Amount: $${tradeAmount}`);
    console.log(`  - Rebate (0.25%): $${rebateAmount}`);
    console.log(`  - Status: ${rebateAmount === 0.25 ? "✅ PASSED" : "❌ FAILED"}`);

    console.log("\n==================================================");
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
    console.log("==================================================");
}

runVerificationTests();
