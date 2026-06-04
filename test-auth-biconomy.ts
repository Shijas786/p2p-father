import { ethers } from "ethers";
import axios from "axios";
import { privateKeyToAccount } from "viem/accounts";

async function testAuth() {
    const pk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // random test pk
    const account = privateKeyToAccount(pk);
    const signer = new ethers.Wallet(pk);
    const depositWallet = "0xf0289B80e60802c678a87bF92f03D51C5e305E0F"; // some proxy wallet

    const timeRes = await axios.get(`https://clob.polymarket.com/time`);
    const ts = timeRes.data.toString();
    const nonce = 0;
    const domain = { name: "ClobAuthDomain", version: "1", chainId: 137 };
    const types = {
        ClobAuth: [
            { name: "address", type: "address" },
            { name: "timestamp", type: "string" },
            { name: "nonce", type: "uint256" },
            { name: "message", type: "string" }
        ]
    };
    const value = {
        address: depositWallet,
        timestamp: ts,
        nonce,
        message: "This message attests that I control the given wallet"
    };
    
    let rawSig = await signer.signTypedData(domain, types, value);
    
    // ABI encode for Biconomy V2 module
    const ECDSA_OWNERSHIP_MODULE = "0x0000001c5b32F37F5beA87BDD5374eB2aC54eA8e";
    const encodedSig = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes", "address"],
        [rawSig, ECDSA_OWNERSHIP_MODULE]
    );

    const headers = {
        "POLY_ADDRESS": depositWallet,
        "POLY_SIGNATURE": encodedSig,
        "POLY_TIMESTAMP": ts,
        "POLY_NONCE": "0",
        "Content-Type": "application/json"
    };

    try {
        const res = await axios.post(`https://clob.polymarket.com/auth/api-key`, {}, { headers });
        console.log("SUCCESS:", res.data);
    } catch (e: any) {
        console.log("FAILED POST:", e.response?.status, e.response?.data);
        if (e.response?.status === 400) {
            try {
                const res2 = await axios.get(`https://clob.polymarket.com/auth/derive-api-key`, { headers });
                console.log("SUCCESS DERIVE:", res2.data);
            } catch (e2: any) {
                console.log("FAILED DERIVE:", e2.response?.status, e2.response?.data);
            }
        }
    }
}
testAuth();
