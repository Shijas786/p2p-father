import { polymarketRelayerService } from "./src/services/relayer";
import { polymarketService } from "./src/services/polymarket";
import { db } from "./src/db";
import { createL1Headers } from "@polymarket/clob-client-v2/dist/utils/signature.js";
import axios from "axios";

async function test() {
    const user = await db.getUserByTelegramId("123456789");
    if(!user) return console.log("NO USER");
    const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index);
    console.log("PROXY:", proxyAddress);
    
    // Test L1 Auth with Builder Key
    const creds = {
        key: process.env.POLYMARKET_BUILDER_API_KEY as string,
        secret: process.env.POLYMARKET_BUILDER_SECRET as string,
        passphrase: process.env.POLYMARKET_BUILDER_PASSPHRASE as string
    };
    const method = "GET";
    const requestPath = `/trades?maker=${proxyAddress}`;
    const ts = Math.floor(Date.now()/1000).toString();
    const headers = await createL1Headers({} as any, 137, 0, ts, proxyAddress);
    // wait, createL1Headers needs a SIGNER! It calls signer.signTypedData!
    // The builder API key has NO signer!
}
