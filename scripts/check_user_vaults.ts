import { createClient } from "@supabase/supabase-js";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const ESCROW_ABI = ["function balances(address user, address token) view returns (uint256)"];
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

async function main() {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
    const rpcUrl = process.env.BSC_RPC_URL!;
    const contractAddress = process.env.ESCROW_CONTRACT_ADDRESS_BSC!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(contractAddress, ESCROW_ABI, provider);

    console.log("Fetching top users from DB...");
    const { data: users, error } = await supabase
        .from('users')
        .select('wallet_address, telegram_id, username')
        .order('completed_trades', { ascending: false });

    if (error) {
        console.error("Supabase error:", error);
        return;
    }

    console.log(`Checking vault balances for ${users.length} users on BSC...`);
    let foundFunds = false;

    for (const user of users) {
        if (!user.wallet_address) continue;
        try {
            const bal = await contract.balances(user.wallet_address, USDT_BSC);
            if (bal > 1000000000000000n) { // > 0.001 USDT
                console.log(`User ${user.username || user.telegram_id} (${user.wallet_address}) has ${ethers.formatUnits(bal, 18)} USDT in vault.`);
                foundFunds = true;
            }
        } catch (e) {
            // ignore
        }
    }

    if (!foundFunds) {
        console.log("No non-zero vault balances found for top 100 users.");
    }
}

main().catch(console.error);
