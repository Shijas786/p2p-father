import axios from 'axios';
async function test() {
    try {
        const res = await axios.get("https://clob.polymarket.com/time");
        console.log("Time response:", res.data);
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}
test();
