import axios from 'axios';

async function run() {
    const address = "0xf0289B80e60802c678a87bF92f03D51C5e305E0F"; // proxy address
    try {
        const res = await axios.get(`https://gamma-api.polymarket.com/profiles/${address}`);
        console.log("Profile exists:", res.data);
    } catch (e: any) {
        console.log("Failed to get profile:", e.response?.status, e.response?.data || e.message);
    }
}
run();
