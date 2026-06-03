const { ClobClient } = require('@polymarket/clob-client');
const ethers = require('ethers');

async function test() {
    const clobClient = new ClobClient({
        host: "https://clob.polymarket.com",
        chain: 137,
        signer: new ethers.Wallet("0x0000000000000000000000000000000000000000000000000000000000000001")
    });

    try {
        const res = await clobClient.getTrades({ maker: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" } /* vitalik's address or any random */);
        console.log(JSON.stringify(res, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}
test();
