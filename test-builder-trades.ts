import { ClobClient, Chain } from "@polymarket/clob-client-v2";
import dotenv from "dotenv";
dotenv.config();

async function test() {
    const creds = {
        key: process.env.POLYMARKET_BUILDER_API_KEY as string,
        secret: process.env.POLYMARKET_BUILDER_SECRET as string,
        passphrase: process.env.POLYMARKET_BUILDER_PASSPHRASE as string
    };
    if (!creds.key) {
        console.log("No builder API key");
        return;
    }
    const client = new ClobClient({
        host: "https://clob.polymarket.com",
        chain: Chain.POLYGON,
        creds
    });
    try {
        const proxyAddress = "0xf20872C359788a53958a048413D64F183403B1f1"; // The proxy address from user's logs
        const trades = await client.getTrades({ maker: proxyAddress } as any);
        console.log("SUCCESS. Fetched", trades?.length, "trades for", proxyAddress);
    } catch (e: any) {
        console.log("FAILED:", e.message, e.response?.data);
    }
}
test();
