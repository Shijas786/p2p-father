const axios = require('axios');
async function test() {
    try {
        // Shijas deposit proxy address: Let me just use a known polymarket user or check format.
        // Actually I don't know a valid address offhand, but I can check the API format.
        const res = await axios.get("https://gamma-api.polymarket.com/positions?user=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"); // vitalik.eth
        console.log(JSON.stringify(res.data.slice(0, 2), null, 2));
    } catch (e) {
        console.error(e.message);
    }
}
test();
