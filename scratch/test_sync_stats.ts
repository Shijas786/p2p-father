import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();
import axios from "axios";

async function run() {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    
    // Fetch all active stats rows
    const { data: statsRows } = await supabase
        .from('prediction_user_stats')
        .select('user_id, telegram_id, username, proxy_address, realized_pnl, total_wagered');

    if (!statsRows || statsRows.length === 0) {
        console.log("No stats rows found");
        return;
    }

    console.log(`Syncing Polymarket official PnL/Vol for ${statsRows.length} users...`);

    for (const row of statsRows) {
        const proxy = row.proxy_address;
        if (!proxy || !proxy.startsWith('0x')) continue;

        try {
            const url = `https://data-api.polymarket.com/v1/leaderboard?user=${proxy.toLowerCase()}&timePeriod=ALL`;
            const res = await axios.get(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
                },
                timeout: 5000
            });

            const data = res.data;
            if (Array.isArray(data) && data.length > 0) {
                const polymarketUser = data[0];
                const pnl = parseFloat(polymarketUser.pnl || '0');
                const vol = parseFloat(polymarketUser.vol || '0');

                console.log(`User ${row.username} (${row.telegram_id}):`);
                console.log(`  Before: PnL=$${row.realized_pnl.toFixed(2)}, Vol=$${row.total_wagered.toFixed(2)}`);
                console.log(`  After:  PnL=$${pnl.toFixed(2)}, Vol=$${vol.toFixed(2)}`);

                await supabase
                    .from('prediction_user_stats')
                    .update({
                        realized_pnl: pnl,
                        total_wagered: vol,
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', row.user_id);
            } else {
                console.log(`User ${row.username} (${row.telegram_id}) has no Polymarket leaderboard records.`);
            }
        } catch (err: any) {
            console.warn(`Failed for user ${row.username}:`, err.message);
        }
        await new Promise(r => setTimeout(r, 100));
    }
}

run();
