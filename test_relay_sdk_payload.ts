import { getClient, createClient, MAINNET_RELAY_API } from "@relayprotocol/relay-sdk";
import { config } from "dotenv";
config();

createClient({ baseApiUrl: MAINNET_RELAY_API, source: "p2pfather" });

// intercept fetch
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
    if (url.toString().includes("execute")) {
        console.log("EXECUTE URL:", url);
        console.log("EXECUTE BODY:", options?.body);
    }
    return originalFetch(url, options);
};

async function run() {
    const client = getClient();
    try {
        await client.actions.execute({
            chainId: 137,
            toChainId: 56, // to BSC
            currency: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB", // Polygon pUSD
            toCurrency: "0x55d398326f99059fF775485246999027B3197955", // BSC USDT
            recipient: "0x3A5668F8B3E167771d503F0321c42a7B082789Ef",
            user: "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02",
            amount: "10000000", // 10 pUSD
            tradeType: "EXACT_INPUT",
            wallet: {
                handleSendTransactionStep: async (chainId, item) => {
                    return "0x_mock_tx_hash";
                },
                address: async () => "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02"
            }
        });
    } catch (e: any) {
    }
}
run();
