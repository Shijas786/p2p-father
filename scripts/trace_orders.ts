import { db } from '../src/db/client';

async function main() {
    console.log('Checking for null type/rate/amount in active orders...');
    const supabase = (db as any).getClient();

    // Check total active orders
    const { count } = await supabase.from('orders').select('id', { count: 'exact' }).eq('status', 'active');
    console.log(`Total active orders: ${count}`);

    // Check for anomalies
    const { data: anomalies, error } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'active')
        .or('type.is.null,rate.is.null,amount.is.null,id.is.null');

    if (error) {
        console.error('Error checking for anomalies:', error);
        return;
    }

    if (anomalies.length > 0) {
        console.log(`Found ${anomalies.length} anomalous active orders:`);
        console.log(JSON.stringify(anomalies, null, 2));
    } else {
        console.log('No null type/rate/amount/id found in active orders.');
    }

    // Also check if any active order has a user that doesn't exist (though users!inner handles this)
    const { data: ordersWithMissingUsers } = await supabase
        .from('orders')
        .select('id, user_id, users(id)')
        .eq('status', 'active');

    const missing = ordersWithMissingUsers?.filter((o: any) => !o.users);
    if (missing && missing.length > 0) {
        console.log(`Found ${missing.length} active orders with MISSING USERS!`);
        console.log(JSON.stringify(missing, null, 2));
    } else {
        console.log('All active orders have valid users.');
    }
}

main().catch(console.error);
