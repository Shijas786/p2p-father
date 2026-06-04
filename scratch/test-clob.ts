async function run() {
    const res = await fetch('https://clob.polymarket.com/time');
    console.log(res.status, await res.text());
}
run();
