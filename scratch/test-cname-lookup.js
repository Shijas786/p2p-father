const https = require('https');
const axios = require('axios');

const customLookup = (hostname, options, callback) => {
    callback(null, "gamma-api.polymarket.com.cdn.cloudflare.net", 4);
};

const agent = new https.Agent({ lookup: customLookup });

axios.get("https://gamma-api.polymarket.com/positions?user=0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02", { httpsAgent: agent })
    .then(res => console.log("Success!"))
    .catch(err => console.log("Axios error:", err.message));
