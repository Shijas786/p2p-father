import { getClient } from "@relayprotocol/relay-sdk";
import { config } from "dotenv";
config();

async function run() {
    const client = getClient();
    try {
        const quote = await client.methods.getQuote({
            chainId: 137,
            toChainId: 56, // to BSC
            currency: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB", // Polygon pUSD
            toCurrency: "0x55d398326f99059fF775485246999027B3197955", // BSC USDT
            recipient: "0x3A5668F8B3E167771d503F0321c42a7B082789Ef",
            amount: "100000000", // 100 pUSD (6 decimals: 100 * 10^6)
            tradeType: "EXACT_INPUT"
        });
        console.log("Quote successful:", quote.fees);
    } catch (e: any) {
        console.error("Quote error:", e.response?.data || e.message);
    }
}
run();
