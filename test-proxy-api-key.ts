import { ClobClient, Chain } from "@polymarket/clob-client-v2";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    const account = privateKeyToAccount("0x1234567890123456789012345678901234567890123456789012345678901234");
    const signer = createWalletClient({ account, transport: http("https://polygon.llamarpc.com") });
    
    // Test with signatureType 0
    const tempClient1 = new ClobClient({
        host: "https://clob.polymarket.com",
        chain: Chain.POLYGON,
        signer,
        signatureType: 0,
    });
    try {
        const creds = await tempClient1.createOrDeriveApiKey();
        console.log("EOA Creds:", creds);
    } catch(e) {
        console.log("EOA Error:", e?.response?.data || e.message);
    }

    // Test with signatureType 3 and dummy funderAddress
    const tempClient2 = new ClobClient({
        host: "https://clob.polymarket.com",
        chain: Chain.POLYGON,
        signer,
        funderAddress: "0x1111111111111111111111111111111111111111",
        signatureType: 3,
    });
    try {
        const creds = await tempClient2.createOrDeriveApiKey();
        console.log("Proxy Creds:", creds);
    } catch(e) {
        console.log("Proxy Error:", e?.response?.data || e.message);
    }
}
main();
