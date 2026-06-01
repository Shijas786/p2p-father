import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BSC_RPC_URL = process.env.BSC_RPC_URL;
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

const ESCROW_BSC = "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

// Standard Multicall3 address on BSC
const MULTICALL_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL_ABI = [
    "function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"
];

const ESCROW_ABI = ["function balances(address user, address token) view returns (uint256)"];

async function run() {
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const multicall = new ethers.Contract(MULTICALL_ADDRESS, MULTICALL_ABI, provider);
    const escrowIface = new ethers.Interface(ESCROW_ABI);

    const { data: users } = await supabase.from("users").select("username, wallet_address").not("wallet_address", "is", null);
    if (!users) return;
    
    console.log(`Checking ${users.length} users with Multicall...`);

    const calls = users.map(u => ({
        target: ESCROW_BSC,
        callData: escrowIface.encodeFunctionData("balances", [u.wallet_address, BSC_USDT])
    }));

    // Split into chunks of 200
    const chunkSize = 200;
    const results = [];
    
    for (let i = 0; i < calls.length; i += chunkSize) {
        const chunk = calls.slice(i, i + chunkSize);
        const { returnData } = await multicall.aggregate(chunk);
        results.push(...returnData);
    }

    let total = 0n;
    for (let i = 0; i < results.length; i++) {
        const bal = escrowIface.decodeFunctionResult("balances", results[i])[0];
        if (bal > 0n) {
            total += bal;
            console.log(`User: ${users[i].username} (${users[i].wallet_address}) -> ${ethers.formatEther(bal)} USDT`);
        }
    }
    console.log("Total USDT Found:", ethers.formatEther(total));
}

run().catch(console.error);
