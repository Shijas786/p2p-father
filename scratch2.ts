import { getClient } from "@relayprotocol/relay-sdk";
type QuoteParams = Parameters<typeof getClient.actions.getQuote>[0];
let _t: QuoteParams;
