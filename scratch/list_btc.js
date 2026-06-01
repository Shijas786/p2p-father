const fetch = require('node-fetch');

async function test() {
    const r = await fetch('https://gamma-api.polymarket.com/events?active=true&closed=false&limit=1000');
    const events = await r.json();
    console.log("Total active events fetched:", events.length);
    
    for (const ev of events) {
        if (ev.title && ev.title.toLowerCase().includes("bitcoin")) {
            console.log("----");
            console.log("Title:", ev.title);
            console.log("Volume:", ev.volume);
            console.log("Slug:", ev.slug);
            for (const m of ev.markets || []) {
                if (m.active && !m.closed) {
                    console.log(`  Market: ${m.question}`);
                    try {
                        const tokenIds = JSON.parse(m.clobTokenIds || "[]");
                        console.log(`  TokenIDs: Yes=${tokenIds[0]} No=${tokenIds[1]}`);
                    } catch (e) {}
                }
            }
        }
    }
}
test();
