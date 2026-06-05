async function run() {
    const res = await fetch('https://gamma-api.polymarket.com/positions?user=0x1Fa39c87d46E965bbBfb457E525fB508C5C8c903');
    const data = await res.json();
    console.log(data);
}
run();
