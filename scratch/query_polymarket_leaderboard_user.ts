import axios from "axios";

async function run() {
    const proxyAddress = '0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02';
    console.log("Querying Polymarket leaderboard API for proxy:", proxyAddress);
    
    try {
        const url = `https://data-api.polymarket.com/v1/leaderboard?user=${proxyAddress}&timePeriod=ALL`;
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
        });
        console.log("Leaderboard Data:", res.data);
    } catch (e: any) {
        console.error("API call failed:", e.response?.data || e.message);
    }
}

run();
