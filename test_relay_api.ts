import { getClient, createClient, MAINNET_RELAY_API } from "@relayprotocol/relay-sdk";
import { config } from "dotenv";
config();

createClient({ baseApiUrl: MAINNET_RELAY_API, source: "p2pfather" });

async function run() {
    const quote = await fetch("https://api.relay.link/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            user: "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02",
            originChainId: 137,
            destinationChainId: 56,
            originCurrency: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
            destinationCurrency: "0x55d398326f99059fF775485246999027B3197955",
            recipient: "0x3A5668F8B3E167771d503F0321c42a7B082789Ef",
            tradeType: "EXACT_INPUT",
            amount: "10000000",
            referrer: "p2pfather",
            useExternalLiquidity: false
        })
    }).then(r => r.json());

    console.log(JSON.stringify(quote.steps, null, 2));
}
run();
