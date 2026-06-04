const axios = require('axios');
async function run() {
    try {
        const res = await axios.get('https://clob.polymarket.com/markets/0x7b4a242ec4cfb5c4013444abefbcbf8e146c820c75cc9e909a349c065f49673a', {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            }
        });
        console.log(Object.keys(res.data));
        console.log(res.data.tokens ? 'Has tokens' : 'No tokens');
    } catch (e) {
        console.error(e.message);
    }
}
run();
