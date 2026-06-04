const axios = require('axios');
axios.get('https://gamma-api.polymarket.com/events?slug=bitcoin-price-up-or-down-today').then(r => console.log(JSON.stringify(r.data[0].markets[0]).substring(0, 500)));
