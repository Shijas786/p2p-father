import { db } from '../src/db/client';

async function main() {
    const address = '0x08FFc32adA724BEAE008f5C08bb1C06c1a737e10';
    console.log(`Checking user with wallet address: ${address}`);

    const { data: user, error } = await (db as any).getClient()
        .from('users')
        .select('*')
        .ilike('wallet_address', address)
        .single();

    if (error) {
        console.error('Error fetching user:', error);
        return;
    }

    console.log('User Details:');
    console.log(JSON.stringify(user, null, 2));
}

main().catch(console.error);
