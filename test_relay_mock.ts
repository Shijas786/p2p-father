import { getClient, createClient, MAINNET_RELAY_API } from "@relayprotocol/relay-sdk";
import { config } from "dotenv";
config();

createClient({ baseApiUrl: MAINNET_RELAY_API, source: "p2pfather" });

async function run() {
    const client = getClient();
    
    // Create a mock viem WalletClient
    const mockWallet = {
        account: { address: "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02" },
        getChainId: async () => 137,
        switchChain: async () => {},
        handleSendTransactionStep: async (chainId: number, item: any) => {
            console.log("INTERCEPTED handleSendTransactionStep:", item);
            return "0x_mock_tx_hash";
        },
        sendTransaction: async (request: any) => {
            console.log("INTERCEPTED sendTransaction:", request);
            return "0x_mock_tx_hash";
        }
    };

    try {
        const quote = await client.actions.getQuote({
            chainId: 137,
            toChainId: 56, // to BSC
            currency: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB", // Polygon pUSD
            toCurrency: "0x55d398326f99059fF775485246999027B3197955", // BSC USDT
            recipient: "0x3A5668F8B3E167771d503F0321c42a7B082789Ef",
            user: "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02",
            amount: "10000000", // 10 pUSD
            tradeType: "EXACT_INPUT"
        });

        await client.actions.execute({
            quote,
            wallet: mockWallet as any,
            onProgress: (progress) => {
                console.log("Progress step:", progress.currentStep?.id);
            }
        });
    } catch (e: any) {
        console.error("Execute error:", e.message);
    }
}
run();
