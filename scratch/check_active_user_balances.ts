import { createClient } from "@supabase/supabase-js";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const bscProvider = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org");
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const bscUsdtContract = new ethers.Contract(BSC_USDT, ERC20_ABI, bscProvider);

async function checkRecentActiveUsers() {
    console.log("🔍 Checking active trades/orders users...");

    const { data: recentTrades } = await supabase
        .from("trades")
        .select("buyer_id, seller_id, status, amount")
        .order("created_at", { ascending: false })
        .limit(20);

    console.log("Recent trades:", recentTrades);

    // Get active user wallets
    const { data: users } = await supabase
        .from("users")
        .select("username, telegram_id, wallet_address")
        .not("wallet_address", "is", null)
        .order("updated_at", { ascending: false })
        .limit(50);

    if (users) {
        console.log("\nChecking top 50 active user wallets for USDT on BSC:");
        for (const u of users) {
            try {
                const bal = await bscUsdtContract.balanceOf(u.wallet_address);
                const usdt = parseFloat(ethers.formatUnits(bal, 18));
                if (usdt > 0.01) {
                    console.log(`💰 User @${u.username || u.telegram_id} (${u.wallet_address}): $${usdt.toFixed(2)} USDT`);
                }
            } catch (e) {}
        }
    }
}

checkRecentActiveUsers().catch(console.error);
