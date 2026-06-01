import http from 'http';

http.get('http://localhost:8000/api/miniapp/predictions/market', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${data}`);
  });
}).on('error', (err) => {
  console.log(`Error: ${err.message}`);
});
