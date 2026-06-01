const axios = require('axios');

async function testBackendLogic() {
    try {
        const now = Date.now();
        const windowStartMs = Math.floor(now / 300000) * 300000;
        const windowStartSeconds = windowStartMs / 1000;
        const slug = `btc-updown-5m-${windowStartSeconds}`;
        
        console.log("Fetching slug:", slug);

        const res = await axios.get(`https://gamma-api.polymarket.com/events`, {
            params: { slug },
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "application/json",
                "Origin": "https://polymarket.com",
                "Referer": "https://polymarket.com/"
            },
            timeout: 2000,
        });

        const events = res.data || [];
        if (events && events.length > 0) {
            const btcEvent = events[0];
            if (btcEvent.markets && btcEvent.markets.length > 0) {
                const market = btcEvent.markets[0];
                if (market.clobTokenIds) {
                    const tokens = typeof market.clobTokenIds === 'string' ? JSON.parse(market.clobTokenIds) : market.clobTokenIds;
                    if (Array.isArray(tokens) && tokens.length >= 2) {
                        console.log("Success! Tokens:", tokens);
                        
                        // Try fetching prices
                        const resY = await axios.get(`https://clob.polymarket.com/book?token_id=${tokens[0]}`);
                        const resN = await axios.get(`https://clob.polymarket.com/book?token_id=${tokens[1]}`);
                        
                        console.log("Yes book best ask:", resY.data?.asks?.[0]?.price);
                        console.log("No book best ask:", resN.data?.asks?.[0]?.price);
                        return;
                    }
                }
            }
        }
        console.log("Failed to find market in events array", events.length);
    } catch (e) {
        console.log("Error:", e.message);
    }
}
testBackendLogic();
