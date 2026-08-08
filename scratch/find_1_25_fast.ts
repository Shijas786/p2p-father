import { createClient } from "@supabase/supabase-js";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const BSC_RPC_URL = process.env.BSC_RPC_URL || "https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER";

const ESCROW_BSC = "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const ESCROW_ABI = [
    "function balances(address user, address token) view returns (uint256)"
];

async function main() {
    console.log("⚡ Fast scanning all database users for 1.25 USDT or stuck vault balances on BSC...");
    const { data: users, error } = await supabase
        .from("users")
        .select("id, telegram_id, username, wallet_address")
        .not("wallet_address", "is", null);

    if (error || !users) {
        console.error("Error fetching users:", error);
        return;
    }

    console.log(`Checking ${users.length} user wallets...`);
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const contract = new ethers.Contract(ESCROW_BSC, ESCROW_ABI, provider);

    const results: any[] = [];

    // Run in batches of 20
    const batchSize = 20;
    for (let i = 0; i < users.length; i += batchSize) {
        const chunk = users.slice(i, i + batchSize);
        await Promise.all(chunk.map(async (u) => {
            if (!u.wallet_address || u.wallet_address === "") return;
            try {
                const bal = await contract.balances(u.wallet_address, BSC_USDT);
                if (bal > 0n) {
                    const formatted = ethers.formatUnits(bal, 18);
                    console.log(`🎯 FOUND VAULT BALANCE! User: @${u.username || u.telegram_id} | Wallet: ${u.wallet_address} | Vault Bal: ${formatted} USDT`);
                    results.push({
                        username: u.username,
                        telegram_id: u.telegram_id,
                        wallet: u.wallet_address,
                        balance: formatted,
                        raw: bal.toString()
                    });
                }
            } catch (e) {}
        }));
    }

    console.log("\n==================================================");
    console.log("SUMMARY OF USERS WITH VAULT BALANCES ON BSC");
    console.log("==================================================");
    console.table(results);
}

main().catch(console.error);
