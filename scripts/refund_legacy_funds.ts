import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const MASTER_SEED = process.env.MASTER_WALLET_SEED!;

const ESCROW_ABI = [
    "function balances(address, address) view returns (uint256)",
    "function withdraw(address token, uint256 amount)",
];

const LEGACY = {
    base: {
        address: "0xf20872C359788a53958a048413D64F183403B1f1",
        rpc: process.env.BASE_RPC_URL || "https://mainnet.base.org",
        tokens: [
            { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
        ]
    },
    bsc: {
        address: "0xe9B4936673BDa2F4899225A0a82E2fdAF456eCA6",
        rpc: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/",
        tokens: [
            { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
            { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
        ]
    }
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

let totalRefunded = 0;
let totalFailed = 0;

async function main() {
    console.log("═══════════════════════════════════════════════");
    console.log("🔄 LEGACY CONTRACT REFUND SCRIPT");
    console.log("═══════════════════════════════════════════════");
    console.log(`Base Legacy: ${LEGACY.base.address}`);
    console.log(`BSC Legacy:  ${LEGACY.bsc.address}`);
    console.log("");

    // Get ALL bot users (only bot wallets can be auto-refunded since we hold the keys)
    const { data: users, error } = await supabase
        .from("users")
        .select("id, wallet_address, wallet_index, username, wallet_type")
        .eq("wallet_type", "bot");

    if (error) throw error;
    console.log(`Found ${users.length} bot wallet users to check.\n`);

    // Setup providers
    const baseProvider = new ethers.JsonRpcProvider(LEGACY.base.rpc);
    const bscProvider = new ethers.JsonRpcProvider(LEGACY.bsc.rpc);

    for (const user of users) {
        if (user.wallet_index === null || user.wallet_index === undefined) continue;

        const mnemonic = ethers.Mnemonic.fromPhrase(MASTER_SEED);
        const derivedWallet = ethers.HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${user.wallet_index}`);

        // Check Base Legacy
        const baseWallet = derivedWallet.connect(baseProvider);
        for (const token of LEGACY.base.tokens) {
            await withdrawIfBalance(user, baseWallet, LEGACY.base.address, token, "Base");
        }

        // Check BSC Legacy
        const bscWallet = derivedWallet.connect(bscProvider);
        for (const token of LEGACY.bsc.tokens) {
            await withdrawIfBalance(user, bscWallet, LEGACY.bsc.address, token, "BSC");
        }
    }

    // Also check external wallet users — just log their balances (we can't withdraw for them)
    const { data: externalUsers, error: extError } = await supabase
        .from("users")
        .select("id, wallet_address, username, wallet_type")
        .eq("wallet_type", "external");

    if (!extError && externalUsers && externalUsers.length > 0) {
        console.log("\n═══════════════════════════════════════════════");
        console.log("📋 EXTERNAL WALLET USERS (manual action needed)");
        console.log("═══════════════════════════════════════════════\n");

        for (const user of externalUsers) {
            if (!user.wallet_address) continue;

            for (const token of LEGACY.base.tokens) {
                await checkExternalBalance(user, baseProvider, LEGACY.base.address, token, "Base");
            }
            for (const token of LEGACY.bsc.tokens) {
                await checkExternalBalance(user, bscProvider, LEGACY.bsc.address, token, "BSC");
            }
        }
    }

    console.log("\n═══════════════════════════════════════════════");
    console.log(`✅ REFUND COMPLETE`);
    console.log(`   Successful: ${totalRefunded}`);
    console.log(`   Failed:     ${totalFailed}`);
    console.log("═══════════════════════════════════════════════");
}

async function withdrawIfBalance(
    user: any,
    wallet: ethers.Wallet | ethers.HDNodeWallet,
    legacyContract: string,
    token: { symbol: string; address: string; decimals: number },
    chainName: string
) {
    try {
        const contract = new ethers.Contract(legacyContract, ESCROW_ABI, wallet);
        const balance: bigint = await contract.balances(wallet.address, token.address);

        if (balance > 0n) {
            const formatted = ethers.formatUnits(balance, token.decimals);
            console.log(`[${chainName}] @${user.username || user.id} — 💰 ${formatted} ${token.symbol} found. Withdrawing...`);

            try {
                const gasOverrides: any = {};
                if (chainName === "BSC") {
                    gasOverrides.gasPrice = ethers.parseUnits("0.1", "gwei");
                    gasOverrides.gasLimit = 250000;
                }

                const tx = await contract.withdraw(token.address, balance, gasOverrides);
                console.log(`  ✅ TX: ${tx.hash}`);
                await tx.wait();
                console.log(`  ✅ Confirmed!`);
                totalRefunded++;
            } catch (err: any) {
                console.error(`  ❌ Withdraw failed: ${err.message}`);
                totalFailed++;
            }
        }
    } catch (err: any) {
        // Silently skip if balance check fails (contract might not exist on this chain for this user)
    }
}

async function checkExternalBalance(
    user: any,
    provider: ethers.JsonRpcProvider,
    legacyContract: string,
    token: { symbol: string; address: string; decimals: number },
    chainName: string
) {
    try {
        const contract = new ethers.Contract(legacyContract, ESCROW_ABI, provider);
        const balance: bigint = await contract.balances(user.wallet_address, token.address);

        if (balance > 0n) {
            const formatted = ethers.formatUnits(balance, token.decimals);
            console.log(`[${chainName}] @${user.username || user.id} (${user.wallet_address}) — ⚠️ ${formatted} ${token.symbol} stuck in legacy. User must withdraw via Migration page.`);
        }
    } catch { }
}

main().catch(console.error);
