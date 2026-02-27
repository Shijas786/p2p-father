
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function syncUserStats() {
    const usernames = ['alan_t_s', 'GUS666FRING'];

    for (const username of usernames) {
        console.log(`\n--- Checking User: ${username} ---`);
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .ilike('username', username.replace('@', ''))
            .single();

        if (error || !user) {
            console.log(`User ${username} not found:`, error?.message);
            continue;
        }

        console.log('Current Stats:', {
            id: user.id,
            username: user.username,
            points: user.points,
            total_trades: user.total_trades,
            total_volume: user.total_volume,
            trust_score: user.trust_score
        });
    }
}

syncUserStats();
