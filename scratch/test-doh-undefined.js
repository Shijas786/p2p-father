const https = require('https');
const axios = require('axios');

async function resolveDoH(hostname) {
    // simulate undefined return
    return undefined;
}

const customLookup = async (hostname, options, callback) => {
    try {
        const ip = await resolveDoH(hostname);
        callback(null, ip, 4);
    } catch (e) {
        // ...
    }
};

const agent = new https.Agent({ lookup: customLookup });

axios.get("https://gamma-api.polymarket.com/positions?user=0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02", { httpsAgent: agent })
    .then(res => console.log("Success!"))
    .catch(err => console.log("Axios error:", err.message));
