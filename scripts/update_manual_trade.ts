
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function updateManualTrade() {
    const tradeId = 'e20c92ab-5763-4680-ac03-00492c62b5d1';
    const alanId = 'a328acfb-bde8-4191-9b74-0bb4b196d3fe';
    const gusId = '8c455899-baf4-4649-b251-5539e731679a';

    console.log(`Starting manual adjustment for Trade ${tradeId}`);

    // 1. Update Trade Status
    const { error: tradeError } = await supabase
        .from('trades')
        .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', tradeId);

    if (tradeError) {
        console.error('Error updating trade:', tradeError);
        return;
    }
    console.log('Trade marked as completed.');

    // 2. Update Alan's Stats
    // Current: 39.001 vol, 5 trades, 79.001 points
    // New: +20 vol, +1 trade, +40 points (20 vol + 20 unique bonus)
    // Target: 59.001 vol, 6 trades, 119.001 points
    const { error: alanError } = await supabase
        .from('users')
        .update({
            total_volume: 59.001,
            trade_count: 6,
            completed_trades: 6,
            points: 119.001,
            updated_at: new Date().toISOString()
        })
        .eq('id', alanId);

    if (alanError) {
        console.error('Error updating Alan:', alanError);
    } else {
        console.log('Alan stats updated successfully.');
    }

    // 3. Update Gus's Stats
    // Current: 0 vol, 0 trades, 0 points
    // New: +20 vol, +1 trade, +40 points (20 vol + 20 unique bonus)
    // Target: 20 vol, 1 trade, 40 points
    const { error: gusError } = await supabase
        .from('users')
        .update({
            total_volume: 20,
            trade_count: 1,
            completed_trades: 1,
            points: 40,
            updated_at: new Date().toISOString()
        })
        .eq('id', gusId);

    if (gusError) {
        console.error('Error updating Gus:', gusError);
    } else {
        console.log('Gus stats updated successfully.');
    }
}

updateManualTrade();
