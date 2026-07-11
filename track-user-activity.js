/**
 * track-user-activity.js
 * Tracks all activity of a given user on the P2P bot for the past N hours.
 * Usage: node track-user-activity.js [username] [hours]
 */

const { createClient } = require('@supabase/supabase-js');
try { require('dotenv').config(); } catch(e) {}

const TARGET_USERNAME = process.argv[2] || 'aslamdt';
const HOURS_BACK      = parseFloat(process.argv[3] || '3');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://demo-project.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
    || 'SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const since  = new Date(Date.now() - HOURS_BACK * 60 * 60 * 1000).toISOString();
const fmt    = (d) => d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—';
const hr     = () => console.log('─'.repeat(70));
const bold   = (s) => `\x1b[1m${s}\x1b[0m`;
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan   = (s) => `\x1b[36m${s}\x1b[0m`;

async function track() {
    console.log(bold(`\n🔍 Tracking activity for: @${TARGET_USERNAME}`));
    console.log(cyan(`   Window : Last ${HOURS_BACK}h  [since ${fmt(since)}]`));
    hr();

    // 1. FIND USER
    const { data: users, error: userErr } = await supabase
        .from('users')
        .select('*')
        .ilike('username', `%${TARGET_USERNAME}%`);

    if (userErr || !users?.length) {
        console.log(red(`❌ No user found matching '${TARGET_USERNAME}'.`));
        if (userErr) console.error(userErr);
        return;
    }

    const user = users[0];
    console.log(bold('\n👤 USER PROFILE'));
    console.log(`   ID           : ${user.id}`);
    console.log(`   Username     : @${user.username}`);
    console.log(`   Name         : ${user.first_name || '—'}`);
    console.log(`   Telegram ID  : ${user.telegram_id}`);
    console.log(`   Wallet       : ${user.wallet_address || '—'} (${user.wallet_type || '—'})`);
    console.log(`   Receive Addr : ${user.receive_address ? yellow(user.receive_address) : '(none — using bot wallet)'}`);
    console.log(`   UPI ID       : ${user.upi_id || '—'}`);
    console.log(`   Phone        : ${user.phone_number || '—'}`);
    console.log(`   Bank Acct    : ${user.bank_account_number || '—'}`);
    console.log(`   Bank IFSC    : ${user.bank_ifsc || '—'}`);
    console.log(`   Bank Name    : ${user.bank_name || '—'}`);
    console.log(`   Trust Score  : ${user.trust_score}`);
    console.log(`   Tier         : ${user.tier}`);
    console.log(`   Verified     : ${user.is_verified ? green('Yes') : 'No'}`);
    console.log(`   Banned       : ${user.is_banned ? red('Yes ⛔') : green('No')}`);
    console.log(`   Joined       : ${fmt(user.created_at)}`);
    console.log(`   Last Updated : ${fmt(user.updated_at)}`);

    // 2. PROFILE CHANGED RECENTLY?
    hr();
    console.log(bold('\n📝 PROFILE CHANGES'));
    const profileUpdated = user.updated_at && new Date(user.updated_at) >= new Date(since);
    if (profileUpdated) {
        console.log(yellow(`   ⚠️  Profile was UPDATED in the last ${HOURS_BACK}h — at ${fmt(user.updated_at)}`));
        console.log(`   → receive_address  : ${user.receive_address || '(cleared / not set)'}`);
        console.log(`   → upi_id           : ${user.upi_id || '(not set)'}`);
        console.log(`   → phone_number     : ${user.phone_number || '(not set)'}`);
        console.log(`   → bank_account     : ${user.bank_account_number || '(not set)'}`);
        console.log(`   → bank_ifsc        : ${user.bank_ifsc || '(not set)'}`);
    } else {
        console.log(green(`   ✅ No profile changes in the last ${HOURS_BACK}h`));
        console.log(`      Last updated at : ${fmt(user.updated_at)}`);
    }

    // 3. TRADES
    hr();
    console.log(bold('\n📊 TRADES (updated in window)'));
    const { data: trades, error: tradeErr } = await supabase
        .from('trades')
        .select('id, status, type, token, chain, amount, fiat_amount, fiat_currency, payment_method, created_at, updated_at, buyer_id, seller_id, release_tx_hash, escrow_tx_hash, dispute_reason')
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .gte('updated_at', since)
        .order('updated_at', { ascending: false });

    if (tradeErr) {
        console.log(red('   Error: ') + tradeErr.message);
    } else if (!trades?.length) {
        console.log(green('   ✅ No trade activity in this window'));
    } else {
        console.log(`   Found ${trades.length} trade(s):\n`);
        for (const t of trades) {
            const role = t.buyer_id === user.id ? '🟢 BUYER' : '🔴 SELLER';
            const sc = t.status === 'completed' ? green(t.status)
                : ['disputed','cancelled','refunded','expired'].includes(t.status) ? red(t.status)
                : yellow(t.status);
            console.log(`   ${role}  Trade: ${t.id}`);
            console.log(`           Status  : ${sc}`);
            console.log(`           Amount  : ${t.amount} ${t.token} on ${t.chain}`);
            console.log(`           Fiat    : ${t.fiat_amount} ${t.fiat_currency} via ${t.payment_method}`);
            console.log(`           Created : ${fmt(t.created_at)}`);
            console.log(`           Updated : ${fmt(t.updated_at)}`);
            if (t.dispute_reason) console.log(red(`           Dispute : ${t.dispute_reason}`));
            if (t.escrow_tx_hash) console.log(`           Escrow TX: ${t.escrow_tx_hash}`);
            if (t.release_tx_hash) console.log(green(`           Release TX: ${t.release_tx_hash}`));
            console.log();
        }
    }

    // 4. ORDERS
    hr();
    console.log(bold('\n📋 ORDERS (updated in window)'));
    const { data: orders, error: orderErr } = await supabase
        .from('orders')
        .select('id, type, token, chain, amount, price, fiat_currency, payment_method, status, created_at, updated_at')
        .eq('user_id', user.id)
        .gte('updated_at', since)
        .order('updated_at', { ascending: false });

    if (orderErr) {
        console.log(red('   Error: ') + orderErr.message);
    } else if (!orders?.length) {
        console.log(green('   ✅ No order activity in this window'));
    } else {
        console.log(`   Found ${orders.length} order(s):\n`);
        for (const o of orders) {
            const typeIcon = o.type === 'buy' ? '🟩 BUY' : '🟥 SELL';
            console.log(`   ${typeIcon}  Order: ${o.id}`);
            console.log(`           Status  : ${o.status}`);
            console.log(`           Amount  : ${o.amount} ${o.token} @ ${o.price} ${o.fiat_currency} via ${o.payment_method}`);
            console.log(`           Created : ${fmt(o.created_at)}`);
            console.log(`           Updated : ${fmt(o.updated_at)}`);
            console.log();
        }
    }

    // 5. PAYMENT PROOFS
    hr();
    console.log(bold('\n🧾 PAYMENT PROOFS (submitted in window)'));
    const { data: proofs, error: proofErr } = await supabase
        .from('payment_proofs')
        .select('id, trade_id, status, submitted_at, verified_at')
        .eq('submitted_by', user.id)
        .gte('submitted_at', since)
        .order('submitted_at', { ascending: false });

    if (proofErr) {
        // table might not exist or different column name – show gracefully
        console.log(yellow(`   (payment_proofs query skipped: ${proofErr.message})`));
    } else if (!proofs?.length) {
        console.log(green('   ✅ No payment proofs in this window'));
    } else {
        for (const p of proofs) {
            console.log(`   Proof   : ${p.id} → Trade ${p.trade_id}`);
            console.log(`   Status  : ${p.status}`);
            console.log(`   Submitted: ${fmt(p.submitted_at)}`);
            if (p.verified_at) console.log(`   Verified : ${fmt(p.verified_at)}`);
            console.log();
        }
    }

    // 6. DISPUTES
    hr();
    console.log(bold('\n⚠️  OPEN DISPUTES (in window)'));
    const disputedTrades = (trades || []).filter(t => t.status === 'disputed');
    if (!disputedTrades.length) {
        console.log(green('   ✅ No disputes in this window'));
    } else {
        for (const d of disputedTrades) {
            console.log(red(`   ⚠️  Trade ${d.id} — Disputed at ${fmt(d.updated_at)}`));
            console.log(`       Reason: ${d.dispute_reason || 'Not specified'}`);
        }
    }

    // SUMMARY
    hr();
    console.log(bold('\n📌 ACTIVITY SUMMARY'));
    console.log(`   User         : @${user.username} (${user.first_name || ''})`);
    console.log(`   Window       : Last ${HOURS_BACK}h  [since ${fmt(since)}]`);
    console.log(`   Profile chg  : ${profileUpdated ? yellow('YES — profile was changed') : green('No changes')}`);
    console.log(`   Receive addr : ${user.receive_address ? yellow(`SET → ${user.receive_address}`) : green('Not set (using bot wallet)')}`);
    console.log(`   Trades active: ${trades?.length || 0}`);
    console.log(`   Orders active: ${orders?.length || 0}`);
    console.log(`   Disputes     : ${disputedTrades.length}`);
    hr();
    console.log();
}

track().catch(console.error);
