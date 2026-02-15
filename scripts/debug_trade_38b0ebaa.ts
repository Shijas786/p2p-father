import { db } from '../src/db/client';

async function main() {
    console.log(`Searching for recent trades in 'fiat_sent' status...`);

    // Fetch all active trades and filter locally since UUID doesn't support LIKE easily in some drivers
    const { data: trades, error } = await (db as any).getClient()
        .from('trades')
        .select(`
            *,
            buyer:users!trades_buyer_id_fkey(username, telegram_id, wallet_address),
            seller:users!trades_seller_id_fkey(username, telegram_id, wallet_address)
        `)
        .in('status', ['in_escrow', 'fiat_sent'])
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching trades:', error);
        return;
    }

    const targetId = '38b0ebaa';
    const matched = trades?.filter((t: any) => t.id.startsWith(targetId));

    console.log(`Matched trades (${targetId}):`);
    console.log(JSON.stringify(matched, null, 2));

    console.log('\nAll Active Trades:');
    console.log(JSON.stringify(trades?.slice(0, 5), null, 2));

    if (matched && matched.length > 0) {
        const trade = matched[0];
        console.log(`\nTrade ID: ${trade.id}`);
        console.log(`Seller: ${trade.seller.username} (TG: ${trade.seller.telegram_id}, Wallet: ${trade.seller.wallet_address})`);
        console.log(`Buyer: ${trade.buyer.username} (TG: ${trade.buyer.telegram_id}, Wallet: ${trade.buyer.wallet_address})`);
    }
}

main().catch(console.error);
