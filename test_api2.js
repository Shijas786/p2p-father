import http from 'http';

http.get('http://localhost:8000/api/stats', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(`Stats Route Status: ${res.statusCode}`);
  });
}).on('error', (err) => {
  console.log(`Error hitting localhost:8000: ${err.message}`);
});

http.get('http://localhost:8000/api/miniapp/predictions/market', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(`Market Route Status: ${res.statusCode}`);
    console.log(`Market Route Body: ${data.substring(0, 100)}...`);
  });
}).on('error', (err) => {
  console.log(`Error hitting localhost:8000: ${err.message}`);
});
