const WebSocket = require('ws');

const ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');
ws.on('open', () => {
    console.log('Connected');
    ws.send(JSON.stringify({
        assets_ids: ["41604513689456577821634568600067645106512613149870104768393529377464098926978"],
        type: "market"
    }));
});
ws.on('message', (data) => {
    console.log('Message:', data.toString());
});
ws.on('error', console.error);
ws.on('close', () => console.log('Closed'));
setTimeout(() => process.exit(0), 5000);
