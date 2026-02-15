import { db } from "../src/db/client";

async function test() {
    console.log("Fetching one order to check schema...");
    try {
        const supabase = (db as any).getClient();
        const { data, error } = await supabase.from("orders").select("*").limit(1);
        if (error) throw error;
        if (data && data[0]) {
            console.log("Columns in 'orders' table:", Object.keys(data[0]));
        } else {
            console.log("No orders found to check columns.");
        }
    } catch (err: any) {
        console.error("Error:", err.message);
    }
}

test();
