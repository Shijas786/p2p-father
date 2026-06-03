import fetch from "node-fetch";

async function run() {
    const body = {
        user: "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02",
        originChainId: 137,
        destinationChainId: 56,
        originCurrency: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB", // pUSD
        destinationCurrency: "0x55d398326f99059fF775485246999027B3197955", // USDT on BSC
        recipient: "0x3A5668F8B3E167771d503F0321c42a7B082789Ef",
        tradeType: "EXACT_INPUT",
        amount: "10000000", // 10 pUSD
        source: "p2pfather",
    };
    
    // Relay V1 execute endpoint, or v2 execute
    // The SDK uses `POST https://api.relay.link/execute/bridge` (or swap or whatever)
    const res = await fetch("https://api.relay.link/execute/bridge", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
    });
    
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
}
run();
