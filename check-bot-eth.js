const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('ethers');

const supabase = createClient('https://demo-project.supabase.co', 'SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER');

async function check() {
    const { data: users } = await supabase.from('users').select('id, wallet_address, wallet_index, telegram_id');
    if (!users) return console.log("No users");
    
    // The user's telegram ID is probably 123456789 or 8329551982 (from admin IDs), or they are just the only active user.
    console.log(`Found ${users.length} users.`);
    
    const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
    
    for (const u of users) {
        if (!u.wallet_address) continue;
        const bal = await provider.getBalance(u.wallet_address);
        const eth = ethers.formatEther(bal);
        console.log(`User ${u.telegram_id} | Wallet: ${u.wallet_address} | ETH: ${eth}`);
        
        // Let's also check if they have USDT in the escrow contract
        const ESCROW_ABI = [{"inputs":[{"internalType":"address","name":"user","type":"address"},{"internalType":"address","name":"token","type":"address"}],"name":"balances","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}];
        const escrow = new ethers.Contract("0xf20872C359788a53958a048413D64F183403B1f1", ESCROW_ABI, provider);
        const vaultBal = await escrow.balances(u.wallet_address, "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2");
        if (vaultBal > 0n) {
            console.log(`  -> Has ${ethers.formatUnits(vaultBal, 6)} USDT in Vault!`);
        }
    }
}

check().catch(console.error);
