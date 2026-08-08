import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function main() {
    const { data, error } = await supabase
        .from('users')
        .select('id, telegram_id, username, first_name, wallet_index, deposit_wallet_address, polymarket_approved')
        .or('username.ilike.%shifin%,first_name.ilike.%shifin%')
        .limit(5);
    
    if (error) { console.error(error); return; }
    console.log('User found:', JSON.stringify(data, null, 2));

    if (!data || data.length === 0) { console.log('No user found'); return; }
    const user = data[0];
    
    const proxyAddress = user.deposit_wallet_address;
    if (!proxyAddress) { console.log('No deposit wallet address'); return; }

    console.log('\nProxy/Deposit wallet:', proxyAddress);

    const pusdAddress = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com');
    const contract = new ethers.Contract(pusdAddress, [
        'function balanceOf(address) view returns (uint256)',
        'function decimals() view returns (uint8)'
    ], provider);

    const balance = await contract.balanceOf(proxyAddress);
    const decimals = await contract.decimals();
    console.log('pUSD Balance:', ethers.formatUnits(balance, decimals));
}
main().catch(console.error);
