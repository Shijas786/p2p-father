const fetch = require('node-fetch');

async function test() {
    const r = await fetch('https://gamma-api.polymarket.com/markets?tag_slug=bitcoin&closed=false&limit=20');
    const markets = await r.json();
    console.log("Total markets:", markets.length);
    for (const m of markets) {
        if (m.active && !m.closed) {
            console.log(`Title: ${m.question}`);
            console.log(`Prices: ${m.outcomePrices}`);
        }
    }
}
test();
