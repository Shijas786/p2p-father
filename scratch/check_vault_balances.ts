import { createClient } from "@supabase/supabase-js";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BASE_RPC_URL = process.env.BASE_RPC_URL;
const BSC_RPC_URL = process.env.BSC_RPC_URL;

const ESCROW_BASE = process.env.ESCROW_CONTRACT_ADDRESS;
const ESCROW_BSC = process.env.ESCROW_CONTRACT_ADDRESS_BSC;

const BASE_USDC = process.env.USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_USDT = process.env.USDT_ADDRESS || "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";

const BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_BNB = "0x0000000000000000000000000000000000000000";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const ESCROW_ABI = [
    "function balances(address user, address token) view returns (uint256)"
];

async function checkVaultBalances() {
    console.log("Fetching all users from Supabase...");
    
    // Fetch all users
    const { data: users, error } = await supabase
        .from("users")
        .select("id, telegram_id, username, first_name, wallet_address")
        .not("wallet_address", "is", null);

    if (error) {
        console.error("Error fetching users:", error);
        return;
    }

    if (!users || users.length === 0) {
        console.log("No users with wallets found in database.");
        return;
    }

    console.log(`Found ${users.length} users with wallet addresses. Initializing providers...`);

    const baseProvider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    const bscProvider = new ethers.JsonRpcProvider(BSC_RPC_URL);

    const contractBase = new ethers.Contract(ESCROW_BASE!, ESCROW_ABI, baseProvider);
    const contractBsc = new ethers.Contract(ESCROW_BSC!, ESCROW_ABI, bscProvider);

    const nonZeroUsers: any[] = [];
    const concurrency = 30; // 30 users in parallel

    for (let i = 0; i < users.length; i += concurrency) {
        const chunk = users.slice(i, i + concurrency);
        console.log(`Processing users ${i + 1} to ${Math.min(i + concurrency, users.length)} / ${users.length}...`);

        await Promise.all(chunk.map(async (user) => {
            const addr = user.wallet_address;
            if (!addr || !ethers.isAddress(addr)) {
                return;
            }

            try {
                const balancesList: any[] = [];

                // 1. Base USDC (6 decimals)
                const baseUsdcBal = await contractBase.balances(addr, BASE_USDC);
                if (baseUsdcBal > 0n) {
                    balancesList.push({ chain: "Base", token: "USDC", amount: ethers.formatUnits(baseUsdcBal, 6) });
                }

                // 2. Base USDT (6 decimals)
                const baseUsdtBal = await contractBase.balances(addr, BASE_USDT);
                if (baseUsdtBal > 0n) {
                    balancesList.push({ chain: "Base", token: "USDT", amount: ethers.formatUnits(baseUsdtBal, 6) });
                }

                // 3. BSC USDC (18 decimals)
                const bscUsdcBal = await contractBsc.balances(addr, BSC_USDC);
                if (bscUsdcBal > 0n) {
                    balancesList.push({ chain: "BSC", token: "USDC", amount: ethers.formatEther(bscUsdcBal) });
                }

                // 4. BSC USDT (18 decimals)
                const bscUsdtBal = await contractBsc.balances(addr, BSC_USDT);
                if (bscUsdtBal > 0n) {
                    balancesList.push({ chain: "BSC", token: "USDT", amount: ethers.formatEther(bscUsdtBal) });
                }

                // 5. BSC BNB (18 decimals)
                const bscBnbBal = await contractBsc.balances(addr, BSC_BNB);
                if (bscBnbBal > 0n) {
                    balancesList.push({ chain: "BSC", token: "BNB", amount: ethers.formatEther(bscBnbBal) });
                }

                if (balancesList.length > 0) {
                    console.log(`💰 [FOUND] @${user.username || user.first_name} (${user.telegram_id}) has funds:`, balancesList);
                    nonZeroUsers.push({
                        id: user.id,
                        telegram_id: user.telegram_id,
                        username: user.username || "None",
                        first_name: user.first_name || "None",
                        wallet_address: addr,
                        balances: balancesList
                    });
                }
            } catch (err: any) {
                // Ignore rate limit or contract errors silently for faster completion, or print warnings
                // console.warn(`Error checking @${user.username}: ${err.message}`);
            }
        }));
    }

    console.log("\n==================================================");
    console.log(`CHECK COMPLETE. Found ${nonZeroUsers.length} users with non-zero vault balances:`);
    console.log("==================================================");

    if (nonZeroUsers.length === 0) {
        console.log("No users have funds in the vault.");
    } else {
        console.log(JSON.stringify(nonZeroUsers, null, 2));
    }
}

checkVaultBalances().catch(console.error);
