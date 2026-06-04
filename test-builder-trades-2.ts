import { ClobClient, Chain } from "@polymarket/clob-client-v2";
import { ethers } from "ethers";
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
    // We need a signer. Let's use a random signer to test if the Builder API Key overrides signer check.
    const signer = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

    const client = new ClobClient({
        host: "https://clob.polymarket.com",
        chain: Chain.POLYGON,
        signer,
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
