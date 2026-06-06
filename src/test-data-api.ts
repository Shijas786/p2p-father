import axios from "axios";

async function main() {
    try {
        const proxyAddress = "0x889812df9335a4D7672803B4C853922EE30a47eb"; // from previous logs
        const trades = await axios.get(`https://data-api.polymarket.com/trades?user=${proxyAddress.toLowerCase()}`);
        console.log("Trades:", trades.data.length);
        const positions = await axios.get(`https://data-api.polymarket.com/positions?user=${proxyAddress.toLowerCase()}`);
        console.log("Positions:", positions.data.length);
    } catch (e: any) {
        console.error(e.message);
    }
}
main();
