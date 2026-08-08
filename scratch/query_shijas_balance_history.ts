import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();
import { ethers } from "ethers";

async function run() {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!);
    
    // Find shijas user
    const { data: user, error: userErr } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', 123456789)
        .single();

    if (userErr || !user) {
        console.error("User shijas not found:", userErr);
        return;
    }

    const proxyAddress = user.deposit_wallet_address || '0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02';
    console.log("User proxy address:", proxyAddress);

    // Get current balance of deposit wallet on-chain
    const pusdAddress = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL || "https://polygon-rpc.com");
    const contract = new ethers.Contract(pusdAddress, [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)"
    ], provider);

    let balance = "0.00";
    try {
        const bal = await contract.balanceOf(proxyAddress);
        const dec = await contract.decimals();
        balance = ethers.formatUnits(bal, dec);
    } catch (e: any) {
        console.warn("Failed to get balance:", e.message);
    }

    console.log("Current pUSD Balance:", balance);

    // Fetch deposits
    const { data: deposits, error: depErr } = await supabase
        .from('prediction_deposits')
        .select('*')
        .eq('user_id', user.id);

    // Fetch withdrawals
    const { data: withdrawals, error: withErr } = await supabase
        .from('prediction_withdrawals')
        .select('*')
        .eq('user_id', user.id);

    console.log("\n=== Deposits ===");
    let totalDeposits = 0;
    if (deposits) {
        for (const d of deposits) {
            console.log(`Amount: $${d.amount_usdc || d.amount} | Status: ${d.status} | Created At: ${d.created_at}`);
            if (d.status === 'completed' || d.status === 'success') {
                totalDeposits += parseFloat(d.amount_usdc || d.amount || '0');
            }
        }
    }

    console.log("\n=== Withdrawals ===");
    let totalWithdrawals = 0;
    if (withdrawals) {
        for (const w of withdrawals) {
            console.log(`Amount: $${w.amount_usdc || w.amount} | Status: ${w.status} | Created At: ${w.created_at}`);
            if (w.status === 'completed' || w.status === 'success') {
                totalWithdrawals += parseFloat(w.amount_usdc || w.amount || '0');
            }
        }
    }

    console.log("\n=== Summary ===");
    console.log(`Total Completed Deposits: $${totalDeposits.toFixed(2)}`);
    console.log(`Total Completed Withdrawals: $${totalWithdrawals.toFixed(2)}`);
    console.log(`Current Balance: $${parseFloat(balance).toFixed(2)}`);
    
    // PnL = Current Balance + Withdrawals - Deposits
    const groundTruthPnl = parseFloat(balance) + totalWithdrawals - totalDeposits;
    console.log(`Ground Truth PnL: $${groundTruthPnl.toFixed(2)}`);
}

run();
