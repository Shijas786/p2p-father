
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkHistory() {
    const alanId = 'a328acfb-bde8-4191-9b74-0bb4b196d3fe';
    const gusId = '8c455899-baf4-4649-b251-5539e731679a';

    console.log(`Checking trades between ${alanId} and ${gusId}`);

    const { count, error } = await supabase
        .from('trades')
        .select('id', { count: 'exact', head: true })
        .or(`and(buyer_id.eq.${alanId},seller_id.eq.${gusId}),and(buyer_id.eq.${gusId},seller_id.eq.${alanId})`)
        .eq('status', 'completed');

    if (error) {
        console.error('Error fetching trades:', error);
    } else {
        console.log(`Completed trades count: ${count}`);
    }

    // Also check current trade_count and completed_trades for both
    const { data: users } = await supabase
        .from('users')
        .select('username, trade_count, completed_trades, points, total_volume')
        .in('id', [alanId, gusId]);

    console.log('\nCurrent User Data:', users);
}

checkHistory();
