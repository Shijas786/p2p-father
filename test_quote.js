const axios = require('axios');
async function run() {
    try {
        const { data } = await axios.post("https://bridge.polymarket.com/quote", {
            fromAmountBaseUnit: "1000000",
            fromChainId: "137",
            fromTokenAddress: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
            recipientAddress: "0x29Bae2CEd4d63092D63B2631643cd552cC0508",
            toChainId: "56",
            toTokenAddress: "0x55d398326f99059fF775485246999027B3197955"
        });
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Quote error:", e.response?.data || e.message);
    }
}
run();
