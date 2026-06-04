import { createL1Headers } from "@polymarket/clob-client-v2/dist/utils/signature.js";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

async function test() {
    const creds = {
        key: process.env.POLYMARKET_BUILDER_API_KEY as string,
        secret: process.env.POLYMARKET_BUILDER_SECRET as string,
        passphrase: process.env.POLYMARKET_BUILDER_PASSPHRASE as string
    };
    if (!creds.key) { console.log("No creds"); return; }
    
    const proxyAddress = "0xf20872C359788a53958a048413D64F183403B1f1";
    const requestPath = `/trades?maker=${proxyAddress}`;
    
    const timeRes = await axios.get("https://clob.polymarket.com/time").catch(()=>({data:{time: Date.now()/1000}}));
    const ts = (timeRes.data.time ?? Math.floor(Date.now()/1000)).toString();
    
    const headers = createL1Headers("GET", requestPath, "", ts, creds);
    
    try {
        const res = await axios.get(`https://clob.polymarket.com${requestPath}`, { headers });
        console.log("SUCCESS!", res.data.length);
    } catch(e: any) {
        console.log("FAIL:", e.response?.status, e.response?.data);
    }
}
test();
