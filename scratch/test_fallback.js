const axios = require('axios');

async function testFallback() {
    const tokenId = "40286392070894520973685412975931221774338575086053303358043681403206338547209";
    try {
        const res = await axios.get(`https://clob.polymarket.com/book?token_id=${tokenId}`);
        const book = res.data;
        const bestBid = book?.bids?.[0]?.price ? parseFloat(book.bids[0].price) : null;
        const bestAsk = book?.asks?.[0]?.price ? parseFloat(book.asks[0].price) : null;
        console.log("Best Bid:", bestBid, "Best Ask:", bestAsk);
    } catch (e) {
        console.log("Error", e.message);
    }
}
testFallback();
