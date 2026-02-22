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

const CONTRACTS = {
    base: {
        legacy: process.env.ESCROW_CONTRACT_ADDRESS_LEGACY || "0xf20872C359788a53958a048413D64F183403B1f1",
        rpc: process.env.BASE_RPC_URL || "https://mainnet.base.org",
        usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    },
    bsc: {
        legacy: process.env.ESCROW_CONTRACT_ADDRESS_BSC_LEGACY || "0xe9B4936673BDa2F4899225A0a82E2fdAF456eCA6",
        rpc: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/",
        usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
    }
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
    console.log("🚀 Starting Auto-Migration for Bot Wallets...");

    // 1. Get all bot users
    const { data: users, error } = await supabase
        .from("users")
        .select("id, wallet_address, wallet_index, username")
        .eq("wallet_type", "bot");

    if (error) throw error;
    console.log(`Found ${users.length} bot users.`);

    // 2. Setup providers
    const baseProvider = new ethers.JsonRpcProvider(CONTRACTS.base.rpc);
    const bscProvider = new ethers.JsonRpcProvider(CONTRACTS.bsc.rpc);

    for (const user of users) {
        if (!user.wallet_index && user.wallet_index !== 0) continue;

        console.log(`\nChecking User: ${user.username || user.id} (Idx: ${user.wallet_index})`);

        // Derive wallet correctly
        const mnemonic = ethers.Mnemonic.fromPhrase(MASTER_SEED);
        const derivedWallet = ethers.HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${user.wallet_index}`);

        const baseWallet = derivedWallet.connect(baseProvider);
        const bscWallet = derivedWallet.connect(bscProvider);

        // Check Base Legacy
        await checkAndMigrate(user, baseWallet, CONTRACTS.base, "Base");
        // Check BSC Legacy
        await checkAndMigrate(user, bscWallet, CONTRACTS.bsc, "BSC");
    }

    console.log("\n✅ Migration Check Complete.");
}

async function checkAndMigrate(user: any, wallet: any, config: any, chainName: string) {
    try {
        const contract = new ethers.Contract(config.legacy, ESCROW_ABI, wallet);
        const balance = await contract.balances(wallet.address, config.usdc);

        if (balance > 0n) {
            const formatted = ethers.formatUnits(balance, chainName === "BSC" ? 18 : 6);
            console.log(`  [${chainName}] 💰 Found ${formatted} USDC. Withdrawing...`);

            try {
                const tx = await contract.withdraw(config.usdc, balance);
                console.log(`  [${chainName}] ✅ Submitted: ${tx.hash}`);
                await tx.wait();
                console.log(`  [${chainName}] ✅ Success!`);
            } catch (err: any) {
                console.error(`  [${chainName}] ❌ Withdraw failed:`, err.message);
            }
        } else {
            // console.log(`  [${chainName}] Clean.`);
        }
    } catch (err: any) {
        console.error(`  [${chainName}] ❌ Error checking balance:`, err.message);
    }
}

main().catch(console.error);
