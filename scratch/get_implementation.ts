import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
const proxyAddress = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);

    // EIP-1967 Implementation Slot
    const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    
    const implRaw = await provider.getStorage(proxyAddress, implementationSlot);
    const implAddress = ethers.getAddress("0x" + implRaw.slice(26));
    
    console.log(`Proxy Address: ${proxyAddress}`);
    console.log(`Implementation Contract Address: ${implAddress}`);
}

main().catch(console.error);
