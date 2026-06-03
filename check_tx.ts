import { ethers } from "ethers";
async function check() {
    const BSC_RPC = "https://bsc-dataseed.binance.org";
    const provider = new ethers.JsonRpcProvider(BSC_RPC);
    const tx = await provider.getTransaction("0xf6f4ca3e901287fdcfa9dd61cb6b2e20bc31c8574968151ef04ddac7046c0a36");
    console.log(tx);
}
check();
