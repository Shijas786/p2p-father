import { db } from './src/db/client';

async function test() {
    const client = db.getClient();
    const { data } = await client
        .from("users")
        .select("id, wallet_index")
        .not("wallet_index", "is", null)
        .gte("wallet_index", 0)
        .limit(100);
    console.log("Users with wallet index:", data?.length);
    console.log(data);
}
test();
