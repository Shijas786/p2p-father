import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { ethers } from "ethers";

config();

async function run() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
        console.error("Missing SUPABASE credentials");
        return;
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC, 137, { staticNetwork: true });
    const usdcAbi = ["function balanceOf(address owner) view returns (uint256)"];
    const usdcContract = new ethers.Contract("0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", usdcAbi, provider);

    const getBalances = async (walletAddress: string) => {
        if (!walletAddress) return { pol: "0.0", usdc: "0.0" };
        try {
            const polBalanceWei = await provider.getBalance(walletAddress);
            const usdcBal = await usdcContract.balanceOf(walletAddress);
            return {
                pol: ethers.formatEther(polBalanceWei),
                usdc: ethers.formatUnits(usdcBal, 6)
            };
        } catch (e) {
            return { pol: "Error", usdc: "Error" };
        }
    };

    let { data: users, error } = await supabase.from('users').select('*').ilike('username', '%shijas%');
    
    if (error || !users || users.length === 0) {
        const res = await supabase.from('users').select('*').eq('username', 'shijas');
        users = res.data || [];
    }

    for (const user of users || []) {
        console.log(`\n======================================================`);
        console.log(`Lead User: ${user.username} (Telegram: ${user.telegram_id})`);
        console.log(`Deposit Wallet: ${user.deposit_wallet_address}`);
        const leadBals = await getBalances(user.deposit_wallet_address);
        console.log(`Balances: ${leadBals.pol} POL | ${leadBals.usdc} USDC.e`);
        console.log(`======================================================`);
        
        if (user.telegram_id) {
            const { data: copiers } = await supabase.from('copy_connections')
                .select('*')
                .eq('lead_telegram_id', user.telegram_id);
            
            console.log(`\nCopiers count: ${copiers?.length || 0}`);
            if (copiers && copiers.length > 0) {
                console.log("------------------------------------------------------");
                for (const c of copiers) {
                    const { data: copierUser } = await supabase.from('users').select('username, deposit_wallet_address').eq('telegram_id', c.copier_telegram_id).single();
                    const username = copierUser?.username || "Unknown";
                    const wallet = copierUser?.deposit_wallet_address;
                    
                    const bals = await getBalances(wallet);
                    console.log(`- ${username} (TG: ${c.copier_telegram_id})`);
                    console.log(`  Wallet: ${wallet || "None"}`);
                    console.log(`  Balance: ${bals.pol} POL | ${bals.usdc} USDC.e`);
                    console.log("------------------------------------------------------");
                }
            }
        }
    }
}

run();
