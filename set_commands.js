const https = require('https');

const data = JSON.stringify({
  commands: [
    { command: "start", description: "Start the bot" },
    { command: "open", description: "Open Mini App" },
    { command: "buy", description: "Buy crypto via P2P" },
    { command: "sell", description: "Sell crypto via P2P" },
    { command: "balance", description: "Check your balance" },
    { command: "wallet", description: "View wallet details" },
    { command: "newad", description: "Create a new P2P ad" },
    { command: "ads", description: "View active P2P ads" },
    { command: "myads", description: "Manage your P2P ads" },
    { command: "mytrades", description: "View your recent trades" },
    { command: "orders", description: "View your open orders" },
    { command: "payment", description: "Manage payment methods" },
    { command: "profile", description: "View your profile" },
    { command: "invite", description: "Invite friends" },
    { command: "leaderboard", description: "View the leaderboard" }
  ]
});

const options = {
  hostname: 'api.telegram.org',
  port: 443,
  path: '/botBOT_TOKEN_REDACTED/setMyCommands',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let responseData = '';
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  res.on('end', () => {
    console.log('Response:', responseData);
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.write(data);
req.end();
