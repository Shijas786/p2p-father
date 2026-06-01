import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BSC_RPC_URL = process.env.BSC_RPC_URL;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
const ADMIN_WALLET_ADDRESS = process.env.ADMIN_WALLET_ADDRESS;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

const ESCROW_BSC = "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

const MULTICALL_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL_ABI = ["function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"];

const ESCROW_ABI = [
    "function balances(address user, address token) view returns (uint256)",
    "function createTradeByRelayer(address _seller, address _buyer, address _token, uint256 _amount, uint256 _duration) returns (uint256)",
    "function refund(uint256 _tradeId)",
    "event TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, address token, uint256 amount, uint256 feeAmount, uint256 deadline)"
];

async function execute() {
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const multicall = new ethers.Contract(MULTICALL_ADDRESS, MULTICALL_ABI, provider);
    const escrowIface = new ethers.Interface(ESCROW_ABI);
    
    const adminSigner = new ethers.Wallet(RELAYER_PRIVATE_KEY!, provider);
    const escrow = new ethers.Contract(ESCROW_BSC, ESCROW_ABI, adminSigner);

    console.log("Fetching all users...");
    const { data: users } = await supabase.from("users").select("username, wallet_address").not("wallet_address", "is", null);
    if (!users) return;

    console.log("Querying vault balances...");
    const calls = users.map(u => ({
        target: ESCROW_BSC,
        callData: escrowIface.encodeFunctionData("balances", [u.wallet_address, BSC_USDT])
    }));

    const results = [];
    for (let i = 0; i < calls.length; i += 200) {
        const { returnData } = await multicall.aggregate(calls.slice(i, i + 200));
        results.push(...returnData);
    }

    const stuckUsers = [];
    for (let i = 0; i < results.length; i++) {
        const bal = escrowIface.decodeFunctionResult("balances", results[i])[0];
        if (bal > 0n) stuckUsers.push({ user: users[i], bal });
    }

    console.log(`\nFound ${stuckUsers.length} users with locked funds.`);
    
    const uniqueWallets = new Map();
    for (const s of stuckUsers) {
        if (!uniqueWallets.has(s.user.wallet_address)) {
            uniqueWallets.set(s.user.wallet_address, s);
        }
    }
    
    for (const { user, bal } of uniqueWallets.values()) {
        console.log(`\nExtracting ${ethers.formatEther(bal)} USDT for ${user.username} (${user.wallet_address})...`);
        try {
            console.log("Creating dummy trade...");
            const tx1 = await escrow.createTradeByRelayer(user.wallet_address, ADMIN_WALLET_ADDRESS, BSC_USDT, bal, 30, { gasLimit: 500000 });
            const receipt = await tx1.wait();
            
            let tradeId = null;
            for (const log of receipt.logs) {
                try {
                    const parsed = escrow.interface.parseLog({ topics: [...log.topics], data: log.data });
                    if (parsed && parsed.name === "TradeCreated") {
                        tradeId = parsed.args[0]; 
                    }
                } catch(e) {}
            }

            if (tradeId !== null) {
                console.log(`Trade created: ${tradeId}. Refunding to flush funds to user...`);
                const tx2 = await escrow.refund(tradeId, { gasLimit: 300000 });
                await tx2.wait();
                console.log(`✅ Success! Extracted to ${user.wallet_address}`);
            } else {
                console.log("Could not parse tradeId from logs, extraction failed for this user.");
            }
        } catch (e: any) {
            console.error(`❌ Failed to extract for ${user.username}:`, e.shortMessage || e.message);
        }
    }
    
    console.log("\nEXTRACTION COMPLETE.");
}

execute().catch(console.error);
