import { ethers } from "ethers";

async function main() {
    const addresses = [
        "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799".toLowerCase(),
        "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02".toLowerCase()
    ];
    const provider = new ethers.JsonRpcProvider("https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR");
    const pusdAddress = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB".toLowerCase();
    const usdcEAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174".toLowerCase();
    const usdcAddress = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359".toLowerCase();
    
    const abi = ["function balanceOf(address) view returns (uint256)"];
    const pusd = new ethers.Contract(pusdAddress, abi, provider);
    const usdcE = new ethers.Contract(usdcEAddress, abi, provider);
    const usdc = new ethers.Contract(usdcAddress, abi, provider);
    
    for (const address of addresses) {
        console.log(`Balances for ${address}:`);
        console.log(`pUSD New: ${ethers.formatUnits(await pusd.balanceOf(address), 6)}`);
        console.log(`USDC.e:   ${ethers.formatUnits(await usdcE.balanceOf(address), 6)}`);
        console.log(`USDC Nat: ${ethers.formatUnits(await usdc.balanceOf(address), 6)}`);
    }
}
main().catch(console.error);
