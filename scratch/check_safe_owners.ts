import { ethers } from "ethers";

const POLYGON_RPC = "https://polygon.llamarpc.com";
const proxyAddress = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const code = await provider.getCode(proxyAddress);
    console.log("Contract deployed code length:", code.length);
    
    if (code === "0x") {
        console.log("Contract is NOT deployed on-chain!");
        return;
    }

    try {
        const safe = new ethers.Contract(proxyAddress, [
            "function getOwners() view returns (address[])",
            "function getThreshold() view returns (uint256)",
            "function isModuleEnabled(address) view returns (bool)"
        ], provider);

        const owners = await safe.getOwners();
        console.log("Safe Owners:", owners);
        console.log("Threshold:", (await safe.getThreshold()).toString());
    } catch (err: any) {
        console.error("Failed to query Safe details:", err.message);
    }
}

main().catch(console.error);
