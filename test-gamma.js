const fetch = require('node-fetch');
async function run() {
    const res = await fetch('https://gamma-api.polymarket.com/events?slug=btc-updown-5m-1718000100');
    const data = await res.json();
    console.log("By slug:", data.length);
    if (data.length > 0 && data[0].markets) {
        const conditionId = data[0].markets[0].conditionId;
        console.log("Condition ID:", conditionId);
        
        const res2 = await fetch('https://gamma-api.polymarket.com/events?condition_id=' + conditionId);
        const data2 = await res2.json();
        console.log("By condition_id:", data2.length > 0 ? "Found" : "Not Found");
        if(data2.message) console.log(data2);
    }
}
run();
