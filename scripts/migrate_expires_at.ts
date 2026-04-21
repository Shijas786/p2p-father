import { db } from '../src/db/client';

async function migrate() {
    const sql = `ALTER TABLE orders ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ; 
                 CREATE INDEX IF NOT EXISTS idx_orders_expires_at_status ON orders(expires_at, status) WHERE status = 'active';`;
    
    console.log("Applying migration...");
    const { error } = await (db as any).getClient().rpc('exec_sql', { sql_query: sql });
    
    if (error) {
        console.error('Migration failed:', error);
        console.log("\nIf you see 'rpc not found', please run this SQL manually in Supabase SQL Editor:\n");
        console.log(sql);
    } else {
        console.log('Migration applied successfully!');
    }
    process.exit(0);
}

migrate();
