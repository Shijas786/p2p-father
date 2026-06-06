import { db } from "../src/db/client";

async function main() {
    console.log("Inspecting database RPC functions...");
    const client = db.getClient();
    
    // We can query pg_proc via RPC if we have one, or check if we can query pg_catalog
    const { data, error } = await client
        .from("users")
        .select("id")
        .limit(1);
        
    if (error) {
        console.error("Error connecting to DB:", error);
        return;
    }
    
    console.log("Connected successfully. Now testing if we can run select query on pg_proc using a generic query or if we get permission denied.");
    
    // Let's check if there is an rpc function we can query. We can try calling common SQL-execution RPC names:
    const testRpcs = ["exec_sql", "run_sql", "execute_sql", "sql", "query"];
    for (const rpc of testRpcs) {
        try {
            const { data: rpcRes, error: rpcErr } = await client.rpc(rpc, { sql: "SELECT 1" });
            if (rpcErr) {
                console.log(`❌ RPC '${rpc}' test:`, rpcErr.message);
            } else {
                console.log(`✅ RPC '${rpc}' exists and returned:`, rpcRes);
            }
        } catch (e: any) {
            console.log(`❌ RPC '${rpc}' test error:`, e.message);
        }
    }
}

main().catch(console.error);
