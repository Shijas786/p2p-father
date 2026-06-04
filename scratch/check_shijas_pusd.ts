import { ethers } from "ethers";

const POLYGON_RPC = "https://polygon.llamarpc.com";
const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const proxyAddress = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const pusd = new ethers.Contract(PUSD_ADDRESS, [
        "function balanceOf(address) view returns (uint256)"
    ], provider);

    const balance = await pusd.balanceOf(proxyAddress);
    console.log(`On-chain pUSD Balance in proxy (${proxyAddress}): ${ethers.formatUnits(balance, 6)} pUSD`);
}

main().catch(console.error);
