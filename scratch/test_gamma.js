const axios = require("axios");
const now = Date.now();
const windowStartMs = Math.floor(now / 300000) * 300000;
const windowEndSeconds = (windowStartMs / 1000) + 300;
const slug = `btc-updown-5m-${windowEndSeconds}`;
console.log("Fetching slug:", slug);

axios.get(`https://gamma-api.polymarket.com/events`, { 
  params: { slug },
  headers: {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  }
})
  .then(res => {
     console.log("Gamma response length:", res.data.length);
     if (res.data.length > 0) {
       console.log("Tokens:", res.data[0].markets[0].clobTokenIds);
     }
  })
  .catch(err => console.error("Error:", err.message));
