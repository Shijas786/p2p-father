import { ClobClient } from "@polymarket/clob-client-v2";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { config } from "dotenv";
import { wallet as walletService } from "./services/wallet";

config();

async function main() {
    const derived = walletService.deriveWallet(3); // 3 is the wallet_index from earlier
    const account = privateKeyToAccount(derived.privateKey as `0x${string}`);
    const signer = createWalletClient({
        account,
        chain: polygon,
        transport: http("https://polygon-rpc.com")
    });

    const client = new ClobClient({
        host: "https://clob.polymarket.com",
        chain: 137,
        signer
    });

    const creds = await client.createOrDeriveApiKey();
    console.log("Creds derived");

    // The deposit wallet address from earlier logs
    const proxyAddress = "0x889812df9335a4D7672803B4C853922EE30a47eb";

    const authClient = new ClobClient({
        host: "https://clob.polymarket.com",
        chain: 137,
        signer,
        creds,
        signatureType: 3,
        funderAddress: proxyAddress
    });

    try {
        const trades = await authClient.getTrades({ maker_address: proxyAddress });
        console.log("Trades count:", trades.length);
        if (trades.length > 0) {
            console.log("First trade:", trades[0]);
        }
    } catch (e: any) {
        console.error("Failed:", e.response?.data || e.message);
    }
}

main();
