import { getClient, createClient, MAINNET_RELAY_API } from "@relayprotocol/relay-sdk";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc, polygon } from "viem/chains";

createClient({
    baseApiUrl: MAINNET_RELAY_API,
    source: "p2pfather",
});

async function test() {
    const account = privateKeyToAccount("0x1234567890123456789012345678901234567890123456789012345678901234");
    const wallet = createWalletClient({
        account,
        chain: bsc,
        transport: http("https://bsc-dataseed.binance.org")
    });

    const quote = await getClient().actions.getQuote({
        user: account.address,
        originChainId: bsc.id,
        destinationChainId: polygon.id,
        originCurrency: "0x55d398326f99059fF775485246999027B3197955",
        destinationCurrency: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e
        recipient: account.address,
        amount: "5000000000000000000",
        tradeType: "EXACT_INPUT"
    });
    console.log(quote);
}
test().catch(console.error);
