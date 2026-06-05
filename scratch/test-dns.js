async function run() {
    const urls = ['data-api.polymarket.com', 'gamma-api.polymarket.com'];
    for (const url of urls) {
        const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${url}&type=A`, {
            headers: { 'accept': 'application/dns-json' }
        });
        const data = await res.json();
        console.log(url, JSON.stringify(data, null, 2));
    }
}
run();
