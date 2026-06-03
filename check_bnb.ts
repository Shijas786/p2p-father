import { ethers } from "ethers";
async function check() {
    const BSC_RPC = "https://bsc-dataseed.binance.org";
    const TARGET = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799"; // Bot EOA
    const provider = new ethers.JsonRpcProvider(BSC_RPC);
    const bal = await provider.getBalance(TARGET);
    console.log(`Bot EOA BNB Balance on BSC: ${ethers.formatEther(bal)}`);
}
check();
