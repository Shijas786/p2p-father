import { ethers } from "ethers";

const POLYGON_RPC = "https://polygon.llamarpc.com";
const ownerAddress = "0xa1f77D1BD604C6290b7b88d34E6DCEe63a254cFD";
const proxyAddress = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    
    const maticBal = await provider.getBalance(ownerAddress);
    console.log(`MATIC balance of owner EOA (${ownerAddress}): ${ethers.formatEther(maticBal)} MATIC`);

    const safe = new ethers.Contract(proxyAddress, [
        "function nonce() view returns (uint256)"
    ], provider);

    try {
        const nonce = await safe.nonce();
        console.log(`Safe Nonce: ${nonce.toString()}`);
    } catch (err: any) {
        console.error("Failed to query Safe nonce:", err.message);
    }
}

main().catch(console.error);
