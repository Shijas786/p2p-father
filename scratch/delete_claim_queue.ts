import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

const targetConditionId = '0x67405fbc8945726be558126fcd7b8a5eae83bea9f8f4f71582e3ec2ffafad384';

async function run() {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!);
    
    console.log(`Checking auto_claim_queue for condition_id: ${targetConditionId}...`);
    
    // Check if table exists and has entries
    try {
        const { data, error } = await supabase
            .from('auto_claim_queue')
            .delete()
            .eq('condition_id', targetConditionId)
            .select();
            
        if (error) {
            console.error("Failed to delete from auto_claim_queue:", error.message || error);
        } else {
            console.log("Delete query completed successfully! Data returned:", data);
        }
    } catch (e: any) {
        console.error("Error executing query:", e.message || e);
    }
}
run();
