import { db } from '../src/db/client';

async function main() {
    console.log('Fetching active orders...');
    try {
        const orders = await db.getActiveOrders(undefined, "USDC", 5);
        console.log(`Found ${orders.length} active orders.`);
        console.log(JSON.stringify(orders, null, 2));
    } catch (err) {
        console.error('Error fetching active orders:', err);
    }
}

main().catch(console.error);
