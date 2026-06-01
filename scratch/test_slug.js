const fetch = require('node-fetch');

async function testSlug() {
    const now = Date.now();
    const windowStartMs = Math.floor(now / 300000) * 300000;
    const windowStartSeconds = windowStartMs / 1000;
    const slug = `btc-updown-5m-${windowStartSeconds}`;
    
    console.log("Current time:", new Date(now).toISOString());
    console.log("Target slug:", slug);
    
    const r = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
    const events = await r.json();
    
    if (events.length > 0) {
        console.log("Found event!");
        console.log("Title:", events[0].title);
        
        // Find the market inside it
        const market = events[0].markets[0];
        console.log("Token IDs:", market.clobTokenIds);
        
        const tokenIds = JSON.parse(market.clobTokenIds);
        const bookY = await (await fetch(`https://clob.polymarket.com/book?token_id=${tokenIds[0]}`)).json();
        console.log("Best Ask Yes:", bookY.asks[0]?.price);
    } else {
        console.log("No event found for slug!");
    }
}

testSlug();
