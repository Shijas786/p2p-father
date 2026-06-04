import axios from 'axios';
async function test() {
    try {
        const res = await axios.get("https://gamma-api.polymarket.com/positions?user=0xd858348d2bc00b2184ff5d908a8d16719e7a83d7");
        console.log("Gamma:", JSON.stringify(res.data.slice(0, 2), null, 2));
    } catch(e:any) { console.error("Gamma err:", e.message) }
    
    try {
        const res = await axios.get("https://data-api.polymarket.com/positions?user=0xd858348d2bc00b2184ff5d908a8d16719e7a83d7");
        console.log("Data:", JSON.stringify(res.data.slice(0, 2), null, 2));
    } catch(e:any) { console.error("Data err:", e.message) }
}
test();
