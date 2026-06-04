import { ethers } from "ethers";

const POLYGON_RPC = "https://polygon.llamarpc.com";
const CTF_ADDRESS = ethers.getAddress("0x4d97dcd97ec945f40cf65f87097ace5ea0476045");
const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const USDCE_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const conditionId = "0x67405fbc8945726be558126fcd7b8a5eae83bea9f8f4f71582e3ec2ffafad384";

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const ctf = new ethers.Contract(CTF_ADDRESS, [
        "function payoutDenominator(bytes32) view returns (uint256)",
        "function payoutNumerators(bytes32, uint256) view returns (uint256)",
        "function balanceOf(address, uint256) view returns (uint256)"
    ], provider);

    const denominator = await ctf.payoutDenominator(conditionId);
    console.log("Denominator:", denominator.toString());

    if (denominator > 0n) {
        const num0 = await ctf.payoutNumerators(conditionId, 0);
        const num1 = await ctf.payoutNumerators(conditionId, 1);
        console.log("Payout Numerator 0:", num0.toString());
        console.log("Payout Numerator 1:", num1.toString());
    }

    // Let's resolve the user's proxy wallets
    // We can query all users from Supabase to find which wallets are active
    // But we can also check indexSets
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

        console.log(`\nindexSet ${indexSet}:`);
        console.log(`  collectionId: ${collectionId}`);
        console.log(`  PUSD Token ID:  ${tokenIdPUSD.toString()}`);
        console.log(`  USDCE Token ID: ${tokenIdUSDCE.toString()}`);
    }
}

main().catch(console.error);
