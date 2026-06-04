import { ClobClient, Chain } from "@polymarket/clob-client-v2";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
    const account = privateKeyToAccount("0x1234567890123456789012345678901234567890123456789012345678901234");
    const signer = createWalletClient({ account, transport: http("https://polygon.llamarpc.com") });
    
    // Create EOA Client
    const client = new ClobClient({
        host: "https://clob.polymarket.com",
        chain: Chain.POLYGON,
        signer,
        signatureType: 0,
    });
    
    try {
        const creds = await client.createOrDeriveApiKey();
        console.log("EOA Creds created successfully.");
        
        // Re-init with creds
        const authClient = new ClobClient({
            host: "https://clob.polymarket.com",
            chain: Chain.POLYGON,
            signer,
            creds,
            signatureType: 0,
        });
        
        // Fetch trades for a RANDOM address
        const trades = await authClient.getTrades({ maker: "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799" } as any);
        console.log("Successfully fetched trades:", trades.length);
    } catch(e: any) {
        console.log("Error:", e?.response?.data || e.message);
    }
}
main();
