const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://demo-project.supabase.co', 'SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER');

async function check() {
    const userId = "536b3e1c-da4b-4146-89a1-a768c3b5375d"; // aslamdt
    
    // get active sell ads for this user
    const { data: ads, error } = await supabase.from('ads')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'sell')
        .eq('is_active', true);
        
    console.log("Ads:", ads);
    
    // sum reserved
    if (ads) {
        for (const ad of ads) {
            console.log(`Ad: ${ad.id} | Token: ${ad.token} | Chain: ${ad.chain} | Available: ${ad.available_amount}`);
        }
    }
}

check().catch(console.error);
