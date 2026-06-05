const axios = require('axios');
async function run() {
    const { data } = await axios.get("https://bridge.polymarket.com/supported-assets");
    const asset = data.supportedAssets.find(a => a.chainId === "56" && a.token.address.toLowerCase() === "0x55d398326f99059fF775485246999027B3197955".toLowerCase());
    console.log(JSON.stringify(asset, null, 2));
}
run();
