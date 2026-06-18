const fetch = require('node-fetch'); // or use built in
async function main() {
    const res = await fetch('http://localhost:3000/wallet/vault/withdraw', { // adjust port
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            // Mock the telegram auth if possible, or we can't test it directly without auth token
        },
        body: JSON.stringify({
            amount: 60,
            token: "USDT",
            chain: "bsc"
        })
    });
    console.log(res.status);
}
main();
