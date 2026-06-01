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

async function checkActiveVaultBalances() {
    console.log("Fetching active users from database...");

    // 1. Get users with trade_count > 0
    const { data: usersWithTrades, error: err1 } = await supabase
        .from("users")
        .select("id, telegram_id, username, first_name, wallet_address")
        .gt("trade_count", 0)
        .not("wallet_address", "is", null);

    if (err1) console.error("Error fetching users with trades:", err1);

    // 2. Get users who have placed orders
    const { data: orders, error: err2 } = await supabase
        .from("orders")
        .select("user_id");

    if (err2) console.error("Error fetching orders:", err2);
    const orderUserIds = new Set((orders || []).map(o => o.user_id));

    // 3. Get users involved in trades
    const { data: trades, error: err3 } = await supabase
        .from("trades")
        .select("buyer_id, seller_id");

    if (err3) console.error("Error fetching trades:", err3);
    const tradeUserIds = new Set<string>();
    (trades || []).forEach(t => {
        if (t.buyer_id) tradeUserIds.add(t.buyer_id);
        if (t.seller_id) tradeUserIds.add(t.seller_id);
    });

    // Merge all user IDs
    const activeUserIds = new Set<string>();
    (usersWithTrades || []).forEach(u => activeUserIds.add(u.id));
    orderUserIds.forEach(id => activeUserIds.add(id));
    tradeUserIds.forEach(id => activeUserIds.add(id));

    console.log(`Found ${activeUserIds.size} unique active users across orders and trades.`);

    // Fetch full user details for these active IDs
    const { data: activeUsers, error: err4 } = await supabase
        .from("users")
        .select("id, telegram_id, username, first_name, wallet_address")
        .in("id", Array.from(activeUserIds))
        .not("wallet_address", "is", null);

    if (err4) {
        console.error("Error fetching active users details:", err4);
        return;
    }

    if (!activeUsers || activeUsers.length === 0) {
        console.log("No active users found.");
        return;
    }

    console.log(`Checking vault balances for ${activeUsers.length} active users...`);

    const baseProvider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    const bscProvider = new ethers.JsonRpcProvider(BSC_RPC_URL);

    const contractBase = new ethers.Contract(ESCROW_BASE!, ESCROW_ABI, baseProvider);
    const contractBsc = new ethers.Contract(ESCROW_BSC!, ESCROW_ABI, bscProvider);

    const nonZeroUsers: any[] = [];

    // Query sequentially to guarantee no rate-limits or dropped calls
    for (let i = 0; i < activeUsers.length; i++) {
        const user = activeUsers[i];
        const addr = user.wallet_address;

        if (!addr || !ethers.isAddress(addr)) continue;

        process.stdout.write(`(${i + 1}/${activeUsers.length}) Checking @${user.username || user.first_name}... `);

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
                console.log("💰 NON-ZERO!");
                nonZeroUsers.push({
                    id: user.id,
                    telegram_id: user.telegram_id,
                    username: user.username || "None",
                    first_name: user.first_name || "None",
                    wallet_address: addr,
                    balances: balancesList
                });
            } else {
                console.log("zero.");
            }
        } catch (err: any) {
            console.log(`❌ Error: ${err.message}`);
        }
    }

    console.log("\n==================================================");
    console.log(`FINISHED. Found ${nonZeroUsers.length} users with funds in current vaults:`);
    console.log("==================================================");
    console.log(JSON.stringify(nonZeroUsers, null, 2));
}

checkActiveVaultBalances().catch(console.error);
