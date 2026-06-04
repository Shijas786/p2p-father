import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
const CTF_ADDRESS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
const PROXY = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";

const ADAPTER_V1 = "0xADa100874d00e3331D00F2007a9c336a65009718";
const ADAPTER_V2 = "0xAdA100Db00Ca00073811820692005400218FcE1f";

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const ctf = new ethers.Contract(CTF_ADDRESS, [
        "function isApprovedForAll(address owner, address operator) view returns (bool)"
    ], provider);

    const approvedV1 = await ctf.isApprovedForAll(PROXY, ADAPTER_V1);
    const approvedV2 = await ctf.isApprovedForAll(PROXY, ADAPTER_V2);

    console.log(`Proxy: ${PROXY}`);
    console.log(`Adapter V1 (${ADAPTER_V1}) approved: ${approvedV1}`);
    console.log(`Adapter V2 (${ADAPTER_V2}) approved: ${approvedV2}`);
}

main().catch(console.error);
