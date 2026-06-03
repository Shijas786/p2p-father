const fetch = require('node-fetch');
async function run() {
    const res = await fetch('https://clob.polymarket.com/markets/0xdf3522f98bd0489ba4ce4812fcefb197fb95cb60f64b449176378e9fcf1bdcf5');
    const data = await res.json();
    console.log(data);
}
run();
