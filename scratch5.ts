import { getClient, createClient, MAINNET_RELAY_API } from "@relayprotocol/relay-sdk";

createClient({ baseApiUrl: MAINNET_RELAY_API, source: "p2pfather" });

async function run() {
  try {
    const quote = await getClient().actions.getQuote({
      user: "0x1234567890123456789012345678901234567890",
      originChainId: "56" as any,
      destinationChainId: "137" as any,
      originCurrency: "0x55d398326f99059fF775485246999027B3197955",
      destinationCurrency: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
      recipient: "0x1234567890123456789012345678901234567890",
      amount: "5000000000000000000",
      tradeType: "EXACT_INPUT"
    });
    console.log(quote ? "Quote success" : "Quote fail");
  } catch(e) {
    console.error(e);
  }
}
run();
