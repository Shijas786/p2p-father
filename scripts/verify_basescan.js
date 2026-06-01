/**
 * Basescan Contract Verification Script
 * Usage: node scripts/verify_basescan.js <CONTRACT_ADDRESS> <FEE_COLLECTOR_ADDRESS>
 *
 * Example:
 *   node scripts/verify_basescan.js 0xYourContract 0xYourWallet
 */

const fs = require("fs");
const https = require("https");
const querystring = require("querystring");

const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "PASTE_YOUR_BASESCAN_API_KEY_HERE";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base Mainnet USDC

const CONTRACT_ADDRESS = process.argv[2];
const FEE_COLLECTOR   = process.argv[3];
const USDC_ADDRESS    = process.argv[4] || BASE_USDC;

if (!CONTRACT_ADDRESS || !FEE_COLLECTOR) {
    console.error("❌ Usage: node verify_basescan.js <CONTRACT_ADDRESS> <FEE_COLLECTOR_ADDRESS>");
    process.exit(1);
}

// Read flattened source (same contract, same file)
const sourceCode = fs.readFileSync(__dirname + "/P2PEscrow_flat.sol", "utf8");

// Encode constructor arguments
function encodeAddress(addr) {
    return addr.replace("0x", "").toLowerCase().padStart(64, "0");
}
const constructorArgs = encodeAddress(FEE_COLLECTOR) + encodeAddress(USDC_ADDRESS);

console.log("📋 Contract Address:", CONTRACT_ADDRESS);
console.log("🏦 Fee Collector:", FEE_COLLECTOR);
console.log("🪙 USDC:", USDC_ADDRESS);
console.log("🔑 Constructor Args:", constructorArgs);
console.log("\n⏳ Submitting verification to Basescan...\n");

const postData = querystring.stringify({
    apikey:              BASESCAN_API_KEY,
    module:              "contract",
    action:              "verifysourcecode",
    contractaddress:     CONTRACT_ADDRESS,
    sourceCode:          sourceCode,
    codeformat:          "solidity-single-file",
    contractname:        "P2PEscrow",
    compilerversion:     "v0.8.20+commit.a1b79de6",
    optimizationUsed:    "1",
    runs:                "200",
    constructorArguements: constructorArgs,
    licenseType:         "3",  // MIT
    evmversion:          "paris",
});

const options = {
    hostname: "api.basescan.org",
    path: "/api",
    method: "POST",
    headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
    },
};

const req = https.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => {
        try {
            const result = JSON.parse(data);
            console.log("📨 Basescan Response:", JSON.stringify(result, null, 2));

            if (result.status === "1") {
                const guid = result.result;
                console.log("\n✅ Verification submitted! GUID:", guid);
                console.log("\n⏳ Checking status in 15 seconds...\n");
                setTimeout(() => checkStatus(guid), 15000);
            } else {
                console.error("\n❌ Submission failed:", result.result || result.message);
                process.exit(1);
            }
        } catch (e) {
            console.error("❌ Failed to parse response:", data);
            process.exit(1);
        }
    });
});

req.on("error", (e) => {
    console.error("❌ Request error:", e.message);
    process.exit(1);
});

req.write(postData);
req.end();

function checkStatus(guid, attempt = 1) {
    const checkData = querystring.stringify({
        apikey: BASESCAN_API_KEY,
        module: "contract",
        action: "checkverifystatus",
        guid:   guid,
    });

    const checkOptions = {
        hostname: "api.basescan.org",
        path:     "/api?" + checkData,
        method:   "GET",
    };

    const checkReq = https.request(checkOptions, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
            try {
                const result = JSON.parse(data);
                console.log(`🔍 Status check #${attempt}:`, result.result);

                if (result.result === "Pass - Verified") {
                    console.log("\n🎉 CONTRACT VERIFIED SUCCESSFULLY ON BASESCAN!");
                    console.log(`🔗 View: https://basescan.org/address/${CONTRACT_ADDRESS}#code`);
                } else if (result.result && result.result.startsWith("Fail")) {
                    console.error("\n❌ Verification failed:", result.result);
                    process.exit(1);
                } else if (attempt < 10) {
                    console.log(`⏳ Still pending... retrying in 10s (attempt ${attempt}/10)`);
                    setTimeout(() => checkStatus(guid, attempt + 1), 10000);
                } else {
                    console.log("⚠️  Check manually:", `https://basescan.org/address/${CONTRACT_ADDRESS}#code`);
                }
            } catch (e) {
                console.error("❌ Status parse error:", data);
            }
        });
    });

    checkReq.on("error", (e) => console.error("❌ Error:", e.message));
    checkReq.end();
}
