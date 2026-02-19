import { ethers } from "hardhat";

async function main() {
    const addresses = [
        "0x5ED1dC490061Bf9e281B849B6D4ed17feE84F260", // BSC Selection
        "0x78c2B85759C5F7d58fEea82D0Be098E540272245"  // Base Selection
    ];

    console.log("🔍 Checking deployed contracts for 'AUTO_RELEASE_DURATION' and 'feeBps'...");

    // Minimal ABIs to check properties
    const abi = [
        "function feeBps() view returns (uint256)",
        "function AUTO_RELEASE_DURATION() view returns (uint256)",
        "function autoRelease(uint256) external", // Check if this function exists in ABI implies logic
        "function feeCollector() view returns (address)"
    ];

    const provider = ethers.provider;
    const network = await provider.getNetwork();
    console.log(`🌍 Network: ${network.name} (ChainId: ${network.chainId})`);


    for (const address of addresses) {
        process.stdout.write(`\nChecking ${address}...\n`);
        const contract = new ethers.Contract(address, abi, provider);

        // 1. Check Fee (via public var)
        try {
            const fee = await contract.feeBps();
            process.stdout.write(`  - Fee: ${fee.toString()} bps (${fee / 100}%)\n`);
        } catch (e) {
            process.stdout.write(`  - Fee: Unable to read (possibly internal/private)\n`);
        }

        // 2. Check Auto-Release (Logic Presence)
        // We try to call autoRelease(99999). 
        // If it reverts "Trade does not exist" -> Function EXISTS (Feature likely Present)
        // If it reverts "Function selector not recognized" -> Function MISSING (Feature Absent)
        try {
            // We expect this to fail
            await contract.autoRelease(99999);
        } catch (e: any) {
            // Analyze the error
            const errorString = e.toString();
            if (errorString.includes("Trade does not exist") || errorString.includes("revert")) {
                // If we get a logic revert, the function MUST exist!
                process.stdout.write(`  - Auto-Release: ✅ PRESENT (Logic Reverted as expected)\n`);
            } else if (errorString.includes("call revert exception") && !errorString.includes("execution reverted")) {
                // This is a bit tricky, but often means function not found in some ethers versions
                process.stdout.write(`  - Auto-Release: ❓ UNKNOWN ERROR: ${e.code}\n`);
            } else {
                process.stdout.write(`  - Auto-Release: ❌ LIKELY ABSENT (Error: ${e.code})\n`);
            }

            // Also check for the constant if public
            try {
                const duration = await contract.AUTO_RELEASE_DURATION();
                process.stdout.write(`  - Duration: ${duration.toString()} sec\n`);
            } catch (inner) {
                // Ignore
            }

            try {
                const collector = await contract.feeCollector();
                process.stdout.write(`  - FeeCollector: ${collector}\n`);
            } catch (inner) {
                // Ignore
            }
        }
    }
    console.log("\n\n✅ Check Complete.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
