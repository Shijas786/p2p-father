async function test() {
    const res = await fetch("https://gamma-api.polymarket.com/trades?maker=0x365d1970c1453bfB446F3fa57Ff440c05c2A5799");
    const json = await res.json();
    console.log(json);
}
test();
