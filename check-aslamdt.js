const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('ethers');

const supabase = createClient('https://demo-project.supabase.co', 'SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER');

async function check() {
    // try finding the user by username or full name or whatever matches 'aslamdt'
    const { data: users, error } = await supabase.from('users').select('*').ilike('username', '%aslamdt%');
    
    if (error) {
        console.error("DB Error:", error);
        return;
    }
    
    if (!users || users.length === 0) {
        console.log("No user found matching 'aslamdt'.");
        return;
    }
    
    const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
    
    for (const u of users) {
        console.log(`User: @${u.username} (ID: ${u.id}, Telegram: ${u.telegram_id})`);
        if (!u.wallet_address) {
            console.log("  No wallet address configured!");
            continue;
        }
        
        console.log(`  Wallet: ${u.wallet_address}`);
        
        // ETH Balance
        const bal = await provider.getBalance(u.wallet_address);
        console.log(`  ETH Balance (Gas): ${ethers.formatEther(bal)} ETH`);
        
        // Vault Balance
        const ESCROW_ABI = [{"inputs":[{"internalType":"address","name":"user","type":"address"},{"internalType":"address","name":"token","type":"address"}],"name":"balances","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}];
        const escrow = new ethers.Contract("0xf20872C359788a53958a048413D64F183403B1f1", ESCROW_ABI, provider);
        
        // USDT on Base
        const USDT_ADDRESS = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";
        const vaultUsdtBal = await escrow.balances(u.wallet_address, USDT_ADDRESS);
        console.log(`  Vault USDT Balance: ${ethers.formatUnits(vaultUsdtBal, 6)} USDT`);
        
        // USDC on Base
        const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
        const vaultUsdcBal = await escrow.balances(u.wallet_address, USDC_ADDRESS);
        console.log(`  Vault USDC Balance: ${ethers.formatUnits(vaultUsdcBal, 6)} USDC`);
    }
}

check().catch(console.error);
