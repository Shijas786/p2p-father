import WebSocket from "ws";
import { customHttpsAgent } from "../src/services/polymarket";

async function main() {
    console.log("Connecting to Polymarket WS user channel...");
    try {
        const polyWs = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/user", {
            agent: customHttpsAgent,
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });

        polyWs.on("open", () => {
            console.log("SUCCESS: Connected to Polymarket WS successfully!");
            polyWs.close();
        });

        polyWs.on("error", (err) => {
            console.error("ERROR: Connection failed:", err.message);
        });

        polyWs.on("close", () => {
            console.log("Connection closed.");
        });

        // Set a timeout
        setTimeout(() => {
            console.log("Timeout reached. Closing.");
            polyWs.close();
        }, 8000);
    } catch (e: any) {
        console.error("Fatal Error:", e.message);
    }
}

main().catch(console.error);
