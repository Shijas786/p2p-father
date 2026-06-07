import { db } from "../src/db/client";

async function main() {
    const supabase = db.getClient();
    const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("username", "shijas")
        .single();
        
    if (!user) return;
    
    const { data: unclaimedRows } = await supabase
        .from("prediction_trades")
        .select("shares, condition_id, outcome")
        .eq("user_id", user.id)
        .eq("resolved", true)
        .eq("resolution", "WIN")
        .eq("claimed", false);
        
    const sum = (unclaimedRows || []).reduce((acc: number, row: any) => acc + (parseFloat(row.shares) || 0), 0);
    console.log(`Current unclaimed winning rows in DB: ${unclaimedRows?.length || 0}`);
    console.log(`Sum of shares: ${sum}`);
    for (const r of unclaimedRows || []) {
        console.log(`- Outcome: ${r.outcome}, Shares: ${r.shares}, Condition: ${r.condition_id}`);
    }
}

main().catch(console.error);
