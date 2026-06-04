import { ethers } from "ethers";

const PUSD_ADDRESS = ethers.getAddress("0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB");
const USDCE_ADDRESS = ethers.getAddress("0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174");
const conditionId = "0x67405fbc8945726be558126fcd7b8a5eae83bea9f8f4f71582e3ec2ffafad384";
const targetTokenId = "0xc549544a7346ebde96f13a15cf6d3cb6b66f697c2e0faf20b205471d15662a44";

function test(collateral: string, indexSetVal: bigint) {
    const parentCollectionId = "0x0000000000000000000000000000000000000000000000000000000000000000";
    
    const collectionId = ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "uint256"],
        [parentCollectionId, conditionId, indexSetVal]
    );

    const tokenId = ethers.solidityPackedKeccak256(
        ["address", "bytes32"],
        [collateral, collectionId]
    );

    console.log(`Collateral: ${collateral}, IndexSet: ${indexSetVal}`);
    console.log(`Computed TokenId: ${tokenId}`);
    console.log(`Match? ${tokenId.toLowerCase() === targetTokenId.toLowerCase()}\n`);
}

async function main() {
    console.log(`Target: ${targetTokenId}\n`);

    test(PUSD_ADDRESS, 1n);
    test(PUSD_ADDRESS, 2n);
    test(USDCE_ADDRESS, 1n);
    test(USDCE_ADDRESS, 2n);
}

main().catch(console.error);
