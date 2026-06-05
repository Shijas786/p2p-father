import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

async function check() {
    try {
        console.log("Checking Relayer TX Status...");
        const relayerRes = await axios.get(
            `https://relayer-v2.polymarket.com/transaction?id=019e9777-bd8b-7a33-8341-a7b5c135a2e3`,
            { 
                headers: { 
                    "RELAYER_API_KEY": process.env.RELAYER_API_KEY, 
                    "RELAYER_API_KEY_ADDRESS": process.env.RELAYER_API_KEY_ADDRESS 
                } 
            }
        );
        console.log(JSON.stringify(relayerRes.data, null, 2));
    } catch (e: any) {
        console.error("Relayer error:", e.response?.data || e.message);
    }

    console.log("\n--------------------------\n");

    try {
        console.log("Checking Bridge Status...");
        const bridgeRes = await axios.get(
            `https://bridge.polymarket.com/status/0x17Ad9D5d310166cB5B06f6eA42E6Be57157C53A0`
        );
        console.log(JSON.stringify(bridgeRes.data, null, 2));
    } catch (e: any) {
        console.error("Bridge error:", e.response?.data || e.message);
    }
}

check();
