const axios = require('axios');

async function findBtcMarket() {
    try {
        const res = await axios.get("https://gamma-api.polymarket.com/events?limit=100&active=true");
        const events = res.data;
        const btcEvents = events.filter(e => e.title.toLowerCase().includes('bitcoin'));
        console.log(JSON.stringify(btcEvents.map(e => ({ title: e.title, slug: e.slug, markets: e.markets?.map(m => ({ conditionId: m.conditionId, tokens: m.clobTokenIds })) })), null, 2));
    } catch (e) {
        console.error(e);
    }
}
findBtcMarket();
