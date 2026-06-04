import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import axios from "axios";
import { ClobClient, Chain } from "@polymarket/clob-client-v2";

const PRIVATE_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001";
const CLOB_API = "https://clob.polymarket.com";

const account = privateKeyToAccount(PRIVATE_KEY as any);
const signer = createWalletClient({
    account,
    chain: polygon,
    transport: http("https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR"),
});

const PROXY_ADDRESS = "0xf0289B80e60802c678a87bF92f03D51C5e305E0F"; // Hardcoded proxy

async function run() {
    console.log("EOA:", account.address);

    const timeRes = await axios.get(`${CLOB_API}/time`);
    const ts = (timeRes.data?.time ?? timeRes.data?.timestamp ?? Math.floor(Date.now() / 1000)).toString();

    const domain = { name: "ClobAuthDomain", version: "1", chainId: 137 };
    const types = {
        ClobAuth: [
            { name: "address", type: "address" },
            { name: "timestamp", type: "string" },
            { name: "nonce", type: "uint256" },
            { name: "message", type: "string" }
        ]
    } as const;

    // Test 1: Native SDK
    console.log("\n--- Test 1: Native SDK ---");
    const client = new ClobClient({ host: CLOB_API, chain: Chain.POLYGON, signer: signer as any });
    try {
        const creds = await client.createApiKey();
        console.log("SUCCESS Native SDK", creds.key);
    } catch (e: any) {
        if (e.response?.status === 400) {
            console.log("FAILED Native SDK (400) - API key exists, falling back to deriveApiKey...");
            try {
                const creds = await client.deriveApiKey();
                console.log("SUCCESS Native SDK Derive", creds.key);
            } catch (deriveE: any) {
                console.log("FAILED Native SDK Derive:", deriveE.response?.status, deriveE.response?.data || deriveE.message);
            }
        } else {
            console.log("FAILED Native SDK:", e.response?.status, e.response?.data || e.message);
        }
    }

    // Custom requests
    const cases = [
        { name: "EOA Address (No Suffix)", polyAddress: account.address, signAddress: account.address, suffix: "" },
        { name: "Deposit Wallet (No Suffix)", polyAddress: PROXY_ADDRESS, signAddress: PROXY_ADDRESS, suffix: "" },
        { name: "Deposit Wallet (With 03 Suffix)", polyAddress: PROXY_ADDRESS, signAddress: PROXY_ADDRESS, suffix: "03" },
    ];

    for (const c of cases) {
        console.log(`\n--- Test: ${c.name} ---`);
        const value = {
            address: c.signAddress as `0x${string}`,
            timestamp: ts,
            nonce: 0n,
            message: "This message attests that I control the given wallet"
        };
        let sig = await signer.signTypedData({
            account,
            domain,
            types,
            primaryType: "ClobAuth",
            message: value
        });
        sig = sig + c.suffix;

        const headers = {
            "POLY_ADDRESS": c.polyAddress,
            "POLY_SIGNATURE": sig,
            "POLY_TIMESTAMP": ts,
            "POLY_NONCE": "0",
            "Content-Type": "application/json"
        };

        try {
            const res = await axios.get(`${CLOB_API}/auth/derive-api-key`, { headers });
            console.log("SUCCESS!", res.data.apiKey);
        } catch (e: any) {
            console.log("FAILED:", e.response?.status, e.response?.data || e.message);
        }
    }
}

run().catch(console.error);
