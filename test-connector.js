async function main() {
    const params = [
        {
            to: "0x55d398326f99059fF775485246999027B3197955",
            data: "0x70a082310000000000000000000000001B0C5760a300358FA52a2bD58e4859EB9fb9ab79"
        },
        "latest"
    ];
    const rpcUrl = 'https://bsc-dataseed.binance.org';
    const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params
        })
    });
    const data = await response.json();
    console.log(data);
}
main();
