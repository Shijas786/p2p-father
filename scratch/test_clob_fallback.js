const axios = require('axios');
async function testClobFallback() {
    try {
        const res = await axios.get(`https://clob.polymarket.com/markets`, {
            params: { active: true },
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "application/json",
                "Origin": "https://polymarket.com",
                "Referer": "https://polymarket.com/"
            },
            timeout: 2000,
        });
        const markets = res.data?.data || res.data || [];
        for (const m of markets) {
            if (m.active && !m.closed && m.question && m.question.toLowerCase().includes("bitcoin")) {
                if (m.tokens && m.tokens.length >= 2) {
                    console.log("Found CLOB market fallback!", m.question);
                    console.log("Tokens:", m.tokens);
                    return;
                }
            }
        }
    } catch (e) {
        console.log("CLOB error:", e.message);
    }
}
testClobFallback();
