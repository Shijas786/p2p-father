async function run() {
    const res = await fetch('https://data-api.polymarket.com/trades?builderCode=P2P_KERALA');
    console.log(res.status, await res.text());
}
run();
