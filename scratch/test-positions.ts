async function run() {
    const res = await fetch('https://data-api.polymarket.com/positions?user=0x1Fa39c87d46E965bbBfb457E525fB508C5C8c903');
    const data = await res.json();
    console.log(JSON.stringify(data.slice(0, 2), null, 2));
}
run();
