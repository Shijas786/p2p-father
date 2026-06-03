import { getClient } from "@relayprotocol/relay-sdk";
const client = getClient();
type QuoteParams = Parameters<typeof client.actions.getQuote>[0];
let _t: QuoteParams = { originChainId: "x" } as any; // Trigger TS error to show expected properties
