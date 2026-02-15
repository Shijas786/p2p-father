import { db } from '../src/db/client';

async function main() {
    console.log('Checking for trade_messages table...');
    const supabase = (db as any).getClient();

    const { data, error } = await supabase
        .from('trade_messages')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error accessing trade_messages:', error);
    } else {
        console.log('Successfully accessed trade_messages table.');
        console.log('Sample data:', data);
    }
}

main().catch(console.error);
