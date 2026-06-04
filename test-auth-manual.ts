import { ethers } from "ethers";
import axios from "axios";

export async function createProxyApiKey(signer: ethers.Wallet, proxyAddress: string) {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = 0;
    const chainId = 137;
    
    const domain = {
        name: "ClobAuthDomain",
        version: "1",
        chainId,
    };
    
    const types = {
        ClobAuth: [
            { name: "address", type: "address" },
            { name: "timestamp", type: "string" },
            { name: "nonce", type: "uint256" },
            { name: "message", type: "string" }
        ]
    };
    
    const value = {
        address: proxyAddress,
        timestamp: `${ts}`,
        nonce: nonce,
        message: "This message attests that I control the given wallet"
    };

    // Sign with the EOA
    let sig = await signer.signTypedData(domain, types, value);
    
    // Append POLY_1271 suffix (03)
    sig = sig + "03"; // 03 is the signatureType indicator for Polymarket EIP-1271 in CLOB API
    
    const headers = {
        POLY_ADDRESS: proxyAddress,
        POLY_SIGNATURE: sig,
        POLY_TIMESTAMP: `${ts}`,
        POLY_NONCE: `${nonce}`
    };

    console.log("Headers:", headers);
    return headers;
}
