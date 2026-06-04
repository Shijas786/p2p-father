import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
const CTF_ADDRESS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";

const assetId1 = "89235192760501573241405207538843282772294320952016122417768167571946018843204"; // Down (IndexSet 2)
const assetId2 = "97048473122249237981553649199633637758471058977634302010942980911255526854725"; // Up (IndexSet 1)

const proxyAddress = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const ctf = new ethers.Contract(CTF_ADDRESS, ["function balanceOf(address, uint256) view returns (uint256)"], provider);

    const hex1 = BigInt(assetId1).toString(16);
    const hex2 = BigInt(assetId2).toString(16);

    console.log(`Asset 1 Hex: 0x${hex1}`);
    console.log(`Asset 2 Hex: 0x${hex2}`);

    const bal1 = await ctf.balanceOf(proxyAddress, BigInt(assetId1));
    const bal2 = await ctf.balanceOf(proxyAddress, BigInt(assetId2));

    console.log(`On-chain balance for Asset 1: ${ethers.formatUnits(bal1, 6)} shares`);
    console.log(`On-chain balance for Asset 2: ${ethers.formatUnits(bal2, 6)} shares`);
}

main().catch(console.error);
