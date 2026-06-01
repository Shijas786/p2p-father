const now = Date.now();
const windowStartMs = Math.floor(now / 300000) * 300000;
const startSec = windowStartMs / 1000;
const endSec = startSec + 300;

console.log(`Current time: ${new Date(now).toISOString()}`);
console.log(`Start slug: btc-updown-5m-${startSec}`);
console.log(`End slug: btc-updown-5m-${endSec}`);

async function go() {
    const fetch = require('node-fetch');
    
    try {
        const rStart = await fetch(`https://gamma-api.polymarket.com/events?slug=btc-updown-5m-${startSec}`);
        const evStart = await rStart.json();
        console.log("Start slug events found:", evStart.length);
        if (evStart.length > 0 && evStart[0].markets && evStart[0].markets.length > 0) {
            console.log("Start slug market active:", evStart[0].markets[0].active);
            console.log("Start slug market closed:", evStart[0].markets[0].closed);
        }
    } catch(e) { console.error("Start fetch error", e); }
    
    try {
        const rEnd = await fetch(`https://gamma-api.polymarket.com/events?slug=btc-updown-5m-${endSec}`);
        const evEnd = await rEnd.json();
        console.log("End slug events found:", evEnd.length);
        if (evEnd.length > 0 && evEnd[0].markets && evEnd[0].markets.length > 0) {
            console.log("End slug market active:", evEnd[0].markets[0].active);
            console.log("End slug market closed:", evEnd[0].markets[0].closed);
        }
    } catch(e) { console.error("End fetch error", e); }
}
go();
