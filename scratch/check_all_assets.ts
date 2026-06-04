import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const USDCE_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const CTF_ADDRESS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
const conditionId = "0x67405fbc8945726be558126fcd7b8a5eae83bea9f8f4f71582e3ec2ffafad384";

const wallets = [
    { name: "Proxy 96", address: "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799" },
    { name: "Proxy 0", address: "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02" }
];

async function main() {
    console.log(`Using RPC: ${POLYGON_RPC}`);
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);

    const pusd = new ethers.Contract(PUSD_ADDRESS, ["function balanceOf(address) view returns (uint256)"], provider);
    const usdce = new ethers.Contract(USDCE_ADDRESS, ["function balanceOf(address) view returns (uint256)"], provider);
    const ctf = new ethers.Contract(CTF_ADDRESS, ["function balanceOf(address, uint256) view returns (uint256)"], provider);

    for (const w of wallets) {
        console.log(`\n===========================================`);
        console.log(`Checking Assets for ${w.name} (${w.address})`);
        console.log(`===========================================`);

        // MATIC Balance
        const maticBal = await provider.getBalance(w.address);
        console.log(`MATIC Balance: ${ethers.formatEther(maticBal)} MATIC`);

        // pUSD Balance
        const pusdBal = await pusd.balanceOf(w.address);
        console.log(`pUSD Balance: ${ethers.formatUnits(pusdBal, 6)} pUSD`);

        // USDC.e Balance
        const usdceBal = await usdce.balanceOf(w.address);
        console.log(`USDC.e Balance: ${ethers.formatUnits(usdceBal, 6)} USDC.e`);

        // CTF shares
        for (const indexSet of [1, 2]) {
            const parentCollectionId = "0x0000000000000000000000000000000000000000000000000000000000000000";
            const collectionId = ethers.solidityPackedKeccak256(
                ["bytes32", "bytes32", "uint256"],
                [parentCollectionId, conditionId, BigInt(indexSet)]
            );
            
            const tokenIdPUSD = BigInt(ethers.solidityPackedKeccak256(
                ["address", "bytes32"],
                [PUSD_ADDRESS, collectionId]
            ));
            const tokenIdUSDCE = BigInt(ethers.solidityPackedKeccak256(
                ["address", "bytes32"],
                [USDCE_ADDRESS, collectionId]
            ));

            const balPUSD = await ctf.balanceOf(w.address, tokenIdPUSD);
            const balUSDCE = await ctf.balanceOf(w.address, tokenIdUSDCE);

            console.log(`\nOutcome IndexSet ${indexSet}:`);
            console.log(`  PUSD Shares:  ${ethers.formatUnits(balPUSD, 6)}`);
            console.log(`  USDCE Shares: ${ethers.formatUnits(balUSDCE, 6)}`);
        }
    }
}

main().catch(console.error);
