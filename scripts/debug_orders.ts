
import { db } from '../src/db/client';
import { env } from '../src/config/env';

async function main() {
    try {
        console.log('Testing getActiveOrders...');
        // We need to mock getClient if it relies on env, but db/client imports env.
        // Ensure env is loaded.
        console.log('Supabase URL:', env.SUPABASE_URL ? 'Set' : 'Missing');

        const orders = await db.getActiveOrders();
        console.log('Success! Orders found:', orders.length);
        if (orders.length > 0) {
            console.log('Sample order:', JSON.stringify(orders[0], null, 2));
        }
    } catch (err: any) {
        console.error('FAILED:', err.message);
        console.error(err);
    }
}

main();
