import { getClient, createClient, MAINNET_RELAY_API } from "@relayprotocol/relay-sdk";
import { config } from "dotenv";
config();

createClient({ baseApiUrl: MAINNET_RELAY_API, source: "p2pfather" });

async function run() {
    const client = getClient();
    try {
        const quote = await client.actions.getQuote({
            chainId: 137,
            toChainId: 56, // to BSC
            currency: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB", // Polygon pUSD
            toCurrency: "0x55d398326f99059fF775485246999027B3197955", // BSC USDT
            recipient: "0x3A5668F8B3E167771d503F0321c42a7B082789Ef",
            user: "0x3A5668F8B3E167771d503F0321c42a7B082789Ef",
            amount: "10000000", // 10 pUSD
            tradeType: "EXACT_INPUT"
        });
        console.log("Quote with pUSD successful:", !!quote);
    } catch (e: any) {
        console.error("Quote error for pUSD:", e.response?.data?.message || e.message);
    }
    
    try {
        const quote2 = await client.actions.getQuote({
            chainId: 137,
            toChainId: 56, // to BSC
            currency: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // Polygon USDC.e
            toCurrency: "0x55d398326f99059fF775485246999027B3197955", // BSC USDT
            recipient: "0x3A5668F8B3E167771d503F0321c42a7B082789Ef",
            user: "0x3A5668F8B3E167771d503F0321c42a7B082789Ef",
            amount: "10000000", // 10 USDC.e
            tradeType: "EXACT_INPUT"
        });
        console.log("Quote with USDC.e successful:", !!quote2);
    } catch (e: any) {
        console.error("Quote error for USDC.e:", e.response?.data?.message || e.message);
    }
}
run();
