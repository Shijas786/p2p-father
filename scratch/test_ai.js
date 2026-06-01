fetch('http://127.0.0.1:8000/api/miniapp/predictions/ai')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);
