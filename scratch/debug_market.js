const fetch = require('node-fetch');

async function debugMarket() {
    const r = await fetch('https://gamma-api.polymarket.com/events?series_slug=btc-up-or-down-5m&active=true&closed=false&limit=100');
    const events = await r.json();
    
    const now = Date.now();
    const btcEvents = events.filter(ev => {
        if (!ev.endDate) return false;
        return new Date(ev.endDate).getTime() > now;
    });
    
    btcEvents.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
    
    console.log(`Found ${btcEvents.length} future events.`);
    
    if (btcEvents.length > 0) {
        const ev = btcEvents[0];
        console.log("Selected Event:", ev.title);
        console.log("Event EndDate:", ev.endDate);
        
        if (ev.markets) {
            const liveMarkets = ev.markets.filter(m => m.active && !m.closed && m.clobTokenIds && new Date(m.endDate).getTime() > now);
            liveMarkets.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
            
            if (liveMarkets.length > 0) {
                const m = liveMarkets[0];
                console.log("Selected Market:", m.question);
                console.log("Market EndDate:", m.endDate);
                console.log("Token IDs:", m.clobTokenIds);
                
                // Fetch book
                const tokens = JSON.parse(m.clobTokenIds);
                const bookY = await (await fetch(`https://clob.polymarket.com/book?token_id=${tokens[0]}`)).json();
                const bookN = await (await fetch(`https://clob.polymarket.com/book?token_id=${tokens[1]}`)).json();
                
                console.log("Yes Book Asks:", bookY.asks.slice(0, 2));
                console.log("Yes Book Bids:", bookY.bids.slice(0, 2));
            } else {
                console.log("No live markets found in event");
            }
        }
    } else {
        console.log("No future events found! API might be paginating them out.");
    }
}

debugMarket();
