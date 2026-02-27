
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findTrade() {
    const alanId = 'a328acfb-bde8-4191-9b74-0bb4b196d3fe';
    const gusId = '8c455899-baf4-4649-b251-5539e731679a';

    console.log(`Searching for active trades between ${alanId} and ${gusId}`);

    const { data: trades, error } = await supabase
        .from('trades')
        .select('*')
        .or(`and(buyer_id.eq.${alanId},seller_id.eq.${gusId}),and(buyer_id.eq.${gusId},seller_id.eq.${alanId})`)
        .neq('status', 'completed')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching trades:', error);
    } else {
        console.log('Found Trades:', trades);
    }
}

findTrade();
