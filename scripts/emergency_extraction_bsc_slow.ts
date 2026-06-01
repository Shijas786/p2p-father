import { createClient } from "@supabase/supabase-js";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BSC_RPC_URL = process.env.BSC_RPC_URL;

const ESCROW_BSC = "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";
const BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_BNB = "0x0000000000000000000000000000000000000000";

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

const ESCROW_ABI = [
    "function balances(address user, address token) view returns (uint256)",
    "function totalVaultBalances(address token) view returns (uint256)"
];

async function scanSlowly() {
    console.log("Connecting to BSC...");
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const contract = new ethers.Contract(ESCROW_BSC, ESCROW_ABI, provider);

    console.log("Fetching users from DB...");
    const { data: users, error } = await supabase.from("users").select("username, wallet_address").not("wallet_address", "is", null);
    if (!users) return;
    
    console.log(`Found ${users.length} users. Scanning slowly to prevent rate limits...`);

    const userBalances = [];
    let totalUsdc = 0n;
    let totalUsdt = 0n;

    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        try {
            // Add a tiny sleep to avoid rate limits
            await new Promise(r => setTimeout(r, 50));
            
            const usdcBal = await contract.balances(user.wallet_address, BSC_USDC);
            const usdtBal = await contract.balances(user.wallet_address, BSC_USDT);

            if (usdcBal > 0n || usdtBal > 0n) {
                totalUsdc += usdcBal;
                totalUsdt += usdtBal;
                userBalances.push({
                    username: user.username,
                    wallet: user.wallet_address,
                    USDC: ethers.formatEther(usdcBal),
                    USDT: ethers.formatEther(usdtBal)
                });
                console.log(`[FOUND] ${user.username} has ${ethers.formatEther(usdtBal)} USDT and ${ethers.formatEther(usdcBal)} USDC`);
            }
        } catch (e: any) {
            console.error(`[ERROR] Failed on ${user.username}: ${e.message}`);
            // Wait longer on error
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    console.table(userBalances);
    console.log("Total USDC:", ethers.formatEther(totalUsdc));
    console.log("Total USDT:", ethers.formatEther(totalUsdt));
}

scanSlowly().catch(console.error);
