import fetch from "node-fetch";

async function run() {
    const rpc = "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
    const address = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";
    
    const body = {
        jsonrpc: "2.0",
        method: "alchemy_getTokenBalances",
        params: [address, "erc20"],
        id: 1
    };
    
    const res = await fetch(rpc, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
    });
    
    const json = await res.json();
    for (const token of json.result.tokenBalances) {
        if (BigInt(token.tokenBalance) > 0n) {
            console.log(`Token: ${token.contractAddress}, Balance: ${token.tokenBalance}`);
        }
    }
    console.log("Done");
}
run();
