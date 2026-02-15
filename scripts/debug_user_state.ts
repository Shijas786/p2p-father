
import { db } from '../src/db/client';

async function main() {
    const TG_ID = 123456789; // Cryptowolf07

    console.log(`Debug for TG ID: ${TG_ID}`);

    // 1. List User via DB client
    const user = await db.getUserByTelegramId(TG_ID);

    if (!user) {
        console.error('User not found via db.getUserByTelegramId!');
        // List all to be sure
        const client = (db as any).getClient();
        const { data: users } = await client.from('users').select('id, username, telegram_id, wallet_address');
        console.log(`Found ${users?.length || 0} users in DB:`);
        users?.forEach((u: any) => console.log(` - ${u.username} (TG:${u.telegram_id})`));
        return;
    }

    console.log('User:', user.username, 'ID:', user.id);
    console.log('Wallet:', user.wallet_address);

    // 2. Get All Orders (Raw Dump)
    const { data: rawOrders } = await (db as any).getClient().from("orders").select("*").eq("user_id", user.id).order('created_at', { ascending: false });
    console.log(`\nFound ${rawOrders?.length} Total Orders (Raw):`);
    rawOrders?.forEach((o: any) => {
        console.log(` - [${o.status}] ${o.type} ${o.amount} ${o.token} ID:${o.id} Created:${o.created_at}`);
    });

    // 3. Get Trades
    const { data: trades } = await (db as any).getClient().from("trades").select("*").or(`seller_id.eq.${user.id},buyer_id.eq.${user.id}`).order('created_at', { ascending: false });
    console.log(`\nFound ${trades?.length} Trades:`);
    trades?.forEach((t: any) => {
        const role = t.seller_id === user.id ? 'SELLER' : 'BUYER';
        console.log(` - [${t.status}] ${role} ${t.amount} ${t.token} ID:${t.id} OrderID:${t.order_id}`);
    });

    // 4. Get Reserved Amount
    const reservedUSDC_Base = await db.getReservedAmount(user.id, 'USDC', 'base');
    const reservedUSDC_BSC = await db.getReservedAmount(user.id, 'USDC', 'bsc');
    console.log(`\nReserved USDC (Base): ${reservedUSDC_Base}`);
    console.log(`Reserved USDC (BSC): ${reservedUSDC_BSC}`);
}

main();
