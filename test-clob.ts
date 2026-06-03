import { env } from "./src/config/env";
import { ClobClient, Chain } from "@polymarket/clob-client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
    const builderKey = process.env.POLYMARKET_BUILDER_API_KEY || "";
    const builderSecret = process.env.POLYMARKET_BUILDER_SECRET || "";
    const builderPassphrase = process.env.POLYMARKET_BUILDER_PASSPHRASE || "";
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY || ""; // Builder's PK

    if (!privateKey) {
        console.error("No builder PK");
        return;
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const signer = createWalletClient({
        account,
        transport: http("https://polygon-rpc.com")
    });

    const client = new ClobClient({
        host: "https://clob.polymarket.com",
        chain: Chain.POLYGON,
        signer,
        creds: {
            key: builderKey,
            secret: builderSecret,
            passphrase: builderPassphrase
        }
    });

    try {
        console.log("Fetching trades for a random maker...");
        // Put a known derived address from the user's logs
        const trades = await client.getTrades({ maker: "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799" } as any);
        console.log("Success! Trades:", trades);
    } catch (e: any) {
        console.error("Failed:", e.message);
    }
}

main();
