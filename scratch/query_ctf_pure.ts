import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
const CTF_ADDRESS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
const conditionId = "0x67405fbc8945726be558126fcd7b8a5eae83bea9f8f4f71582e3ec2ffafad384";
const targetTokenId = "89235192760501573241405207538843282772294320952016122417768167571946018843204"; // Down

const collaterals = [
    "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB", // pUSD
    "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e
    "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC native
    "0xc2132d05D31c914a87C6611C10748AEb04B58e8F", // USDT
    "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"  // WMATIC
];

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const ctf = new ethers.Contract(CTF_ADDRESS, [
        "function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) public pure returns (bytes32)",
        "function getPositionId(address collateralToken, bytes32 collectionId) public pure returns (uint256)"
    ], provider);

    const parentCollectionId = "0x0000000000000000000000000000000000000000000000000000000000000000";

    console.log(`Target TokenId: ${targetTokenId}`);
    
    for (const collateral of collaterals) {
        for (const indexSet of [1n, 2n, 3n]) {
            try {
                const collectionId = await ctf.getCollectionId(parentCollectionId, conditionId, indexSet);
                const tokenId = await ctf.getPositionId(collateral, collectionId);
                
                if (tokenId.toString() === targetTokenId) {
                    console.log(`\n🎉 MATCH FOUND!`);
                    console.log(`Collateral: ${collateral}`);
                    console.log(`IndexSet: ${indexSet}`);
                    console.log(`CollectionId: ${collectionId}`);
                    console.log(`TokenId: ${tokenId}`);
                    return;
                }
            } catch (err: any) {
                console.error(`Error for collateral ${collateral}, indexSet ${indexSet}:`, err.message);
            }
        }
    }
    console.log("\nNo match found after querying all combinations.");
}

main().catch(console.error);
