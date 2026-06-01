import http from 'http';

console.log("Checking if backend is alive...");

const req = http.get('http://localhost:8000/api/miniapp/predictions/market', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(`\n=== MARKET ROUTE RESULT ===`);
    console.log(`HTTP Status: ${res.statusCode}`);
    console.log(`Response Body: ${data.substring(0, 300)}`);
    console.log(`===========================\n`);
  });
}).on('error', (err) => {
  console.log(`\n=== ERROR ===`);
  console.log(`Backend is down or unreachable: ${err.message}`);
  console.log(`===========================\n`);
});

req.end();
