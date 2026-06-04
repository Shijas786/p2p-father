const axios = require('axios');
axios.get('https://data-api.polymarket.com/positions?user=0x365d1970c1453bfB446F3fa57Ff440c05c2A5799').then(r => console.log(r.data[0]));
