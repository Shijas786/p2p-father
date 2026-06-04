import crypto from "crypto";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

export function buildPolyHmacSignature(secret: string, timestamp: number, method: string, requestPath: string, body?: string): string {
    const message = `${timestamp}${method}${requestPath}${body ?? ""}`;
    const base64Secret = Buffer.from(secret, "base64");
    const hmac = crypto.createHmac("sha256", base64Secret);
    const signature = hmac.update(message).digest("base64");
    return signature;
}

async function test() {
    const key = process.env.POLYMARKET_BUILDER_API_KEY as string;
    const secret = process.env.POLYMARKET_BUILDER_SECRET as string;
    const pass = process.env.POLYMARKET_BUILDER_PASSPHRASE as string;
    
    if (!key) { console.log("No builder API key"); return; }
    
    const proxyAddress = "0xf20872C359788a53958a048413D64F183403B1f1";
    const method = "GET";
    const requestPath = `/trades?maker=${proxyAddress}`;
    
    // Using an arbitrary timestamp, since clob time might fail due to network
    // Oh wait, sandbox has no network, I'll run this inside the container using the dev script.
}
