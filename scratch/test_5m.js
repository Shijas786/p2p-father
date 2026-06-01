const fetch = require('node-fetch');

async function test() {
    const r = await fetch('https://gamma-api.polymarket.com/events?slug=btc-up-or-down-5m');
    const event = await r.json();
    console.log("Event:", event.title);
    if (event.markets) {
        const now = new Date();
        for (const m of event.markets) {
            if (m.active && !m.closed) {
                const end = new Date(m.endDate);
                console.log(`- Market: ${m.question}, endDate: ${m.endDate}, active: ${m.active}, closed: ${m.closed}`);
            }
        }
    }
}
test();
