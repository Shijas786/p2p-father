import { polymarketRelayerService } from "../src/services/relayer";
import { ethers } from "ethers";

const POLYGON_RPC = "https://polygon.llamarpc.com";
const CTF_ADDRESS = ethers.getAddress("0x4d97dcd97ec945f40cf65f87097ace5ea0476045");
const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const USDCE_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const conditionId = "0x67405fbc8945726be558126fcd7b8a5eae83bea9f8f4f71582e3ec2ffafad384";
const userIndex = 0;
const proxyAddress = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const ctf = new ethers.Contract(CTF_ADDRESS, [
        "function balanceOf(address, uint256) view returns (uint256)"
    ], provider);

    console.log(`Checking balances for proxy: ${proxyAddress}`);

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

        const balPUSD = await ctf.balanceOf(proxyAddress, tokenIdPUSD);
        const balUSDCE = await ctf.balanceOf(proxyAddress, tokenIdUSDCE);

        console.log(`\nindexSet ${indexSet}:`);
        console.log(`  PUSD Token Balance:  ${ethers.formatUnits(balPUSD, 6)} shares`);
        console.log(`  USDCE Token Balance: ${ethers.formatUnits(balUSDCE, 6)} shares`);

        const winningIndexSet = 2; // indexSet 2 is the winning outcome (No/Down)

        if (indexSet === winningIndexSet) {
            if (balPUSD > 0n || balUSDCE > 0n) {
                console.log(`\nAttempting to redeem winning position indexSet ${indexSet} for user index 0...`);
                try {
                    const txHash = await polymarketRelayerService.redeemPositions(userIndex, conditionId, indexSet);
                    console.log(`Redemption successful! Tx Hash: ${txHash}`);
                } catch (err: any) {
                    console.error(`Redemption failed:`, err.message);
                }
            } else {
                console.log(`\nNo winning balance (indexSet ${indexSet}) found on-chain for either collateral.`);
            }
        }
    }
}

main().catch(console.error);
