const https = require('https');

async function fetchMarkets() {
    console.log("Fetching polymarket events...");
    const url = "https://gamma-api.polymarket.com/events?limit=50&active=false&closed=true";
    
    https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            const events = JSON.parse(data);
            const btc5m = events.filter(e => e.title && e.title.includes("BTC") && e.title.includes("5m"));
            console.log(`Total closed events fetched: ${events.length}`);
            console.log(`BTC 5m events found: ${btc5m.length}`);
            if (btc5m.length > 0) {
                console.log("Sample BTC 5m Event:", JSON.stringify(btc5m[0].title));
                if (btc5m[0].markets && btc5m[0].markets.length > 0) {
                    console.log("Sample Market Question:", btc5m[0].markets[0].question);
                    console.log("Sample Market Resolution:", btc5m[0].markets[0].groupItemTitle);
                }
            }
        });
    }).on('error', err => console.log('Error: ', err.message));
}

fetchMarkets();
