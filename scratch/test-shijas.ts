import { polymarketService } from "../src/services/polymarket";

async function run() {
    const wallet = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";
    const proxy = await polymarketService.deriveProxyAddress(wallet);
    console.log("Shijas proxy:", proxy);
    const trades = await polymarketService.getTradesForProxy(proxy as string);
    console.log("Shijas trades:", trades.length);
}
run();
