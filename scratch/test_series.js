const fetch = require('node-fetch');

async function test() {
    // Try to get all 5m events
    const r = await fetch('https://gamma-api.polymarket.com/events?series_slug=btc-up-or-down-5m&active=true&closed=false');
    const events = await r.json();
    console.log("Events count:", events.length);
    if (events.length > 0) {
        for (const ev of events) {
            console.log("Found event:", ev.title, "endDate:", ev.endDate);
            if (ev.markets) {
                for (const m of ev.markets) {
                    if (m.active && !m.closed) {
                        console.log(`  Market: ${m.question}, endDate: ${m.endDate}`);
                    }
                }
            }
        }
    } else {
        // try another way
        console.log("Fallback to fetching by tags");
    }
}
test();
