const axios = require('axios');

async function test() {
    console.log("Fetching Polymarket CLOB...");
    try {
        const res = await axios.get("https://clob.polymarket.com/markets", {
            params: { active: true },
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                "Accept": "application/json"
            },
            timeout: 5000
        });
        console.log("SUCCESS! Got data of length:", res.data?.data?.length);
    } catch (e) {
        console.error("FAIL! Error:", e.message);
        if (e.response) {
            console.error("Status:", e.response.status);
            console.error("Body:", e.response.data);
        }
    }
}
test();
