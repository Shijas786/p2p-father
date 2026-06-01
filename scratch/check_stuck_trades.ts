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

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const ESCROW_ABI = [
    "function trades(uint256 tradeId) view returns (address seller, uint8 status, uint32 createdAt, uint32 deadline, address buyer, uint32 fiatSentAt, address token, address disputeInitiator, uint256 amount, uint256 feeAmount, uint256 buyerReceives)"
];

async function checkStuckTrades() {
    console.log("Fetching active/disputed/fiat_sent trades from Supabase...");
    
    // Fetch active trades
    const { data: trades, error } = await supabase
        .from("trades")
        .select("id, on_chain_trade_id, chain, token, amount, status, seller_id, buyer_id, seller:users!seller_id(username, wallet_address)")
        .in("status", ["in_escrow", "fiat_sent", "disputed"])
        .not("on_chain_trade_id", "is", null);

    if (error) {
        console.error("Error fetching trades:", error);
        return;
    }

    if (!trades || trades.length === 0) {
        console.log("No stuck trades found in database.");
        return;
    }

    console.log(`Found ${trades.length} active/stuck trades in DB. Verifying on-chain...`);

    const baseProvider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    const bscProvider = new ethers.JsonRpcProvider(BSC_RPC_URL);

    const contractBase = new ethers.Contract(ESCROW_BASE!, ESCROW_ABI, baseProvider);
    const contractBsc = new ethers.Contract(ESCROW_BSC!, ESCROW_ABI, bscProvider);

    const stuckTrades = [];

    for (const trade of trades) {
        try {
            const onChainId = trade.on_chain_trade_id;
            const isBsc = trade.chain?.toLowerCase().includes("bsc");
            const contract = isBsc ? contractBsc : contractBase;

            const onChainTrade = await contract.trades(onChainId);
            const statusInt = Number(onChainTrade.status); // 0=None, 1=Active, 2=FiatSent, 3=Disputed, 4=Completed, 5=Refunded, 6=Cancelled

            if (statusInt === 1 || statusInt === 2 || statusInt === 3) {
                console.log(`💰 [STUCK] Trade #${onChainId} on ${trade.chain} is stuck (status ${statusInt}). Seller: ${trade.seller?.wallet_address}`);
                stuckTrades.push({
                    db_id: trade.id,
                    on_chain_id: onChainId,
                    chain: trade.chain,
                    token: trade.token,
                    amount: trade.amount,
                    on_chain_status: statusInt,
                    seller_wallet: trade.seller?.wallet_address
                });
            } else {
                console.log(`✅ [OK] Trade #${onChainId} on ${trade.chain} is already finalized (status ${statusInt}).`);
            }
        } catch (e: any) {
            console.error(`Error checking trade #${trade.on_chain_trade_id}:`, e.message);
        }
    }

    console.log("\n==================================================");
    console.log(`FOUND ${stuckTrades.length} STUCK TRADES ON-CHAIN.`);
    console.log(JSON.stringify(stuckTrades, null, 2));
}

checkStuckTrades().catch(console.error);
