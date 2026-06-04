import { ethers } from "ethers";

const targetTokenId = "0xc549544a7346ebde96f13a15cf6d3cb6b66f697c2e0faf20b205471d15662a44";
const conditionId = "0x67405fbc8945726be558126fcd7b8a5eae83bea9f8f4f71582e3ec2ffafad384";
const parentCollectionId = "0x0000000000000000000000000000000000000000000000000000000000000000";

const collaterals = [
    "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB", // pUSD
    "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e
    "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC native
    "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
    "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WMATIC
];

async function main() {
    console.log(`Brute forcing combinations for target: 0x${targetTokenId}...`);

    for (const collateral of collaterals) {
        const collateralAddr = ethers.getAddress(collateral);
        
        for (const indexSetVal of [1n, 2n, 3n, 4n]) {
            // Type 1: solidityPackedKeccak256 with ["bytes32", "bytes32", "uint256"]
            {
                const collectionId = ethers.solidityPackedKeccak256(
                    ["bytes32", "bytes32", "uint256"],
                    [parentCollectionId, conditionId, indexSetVal]
                );
                const tokenId = ethers.solidityPackedKeccak256(
                    ["address", "bytes32"],
                    [collateralAddr, collectionId]
                );
                if (tokenId === "0x" + targetTokenId) {
                    console.log(`MATCH FOUND!`);
                    console.log(`Collateral: ${collateralAddr}`);
                    console.log(`IndexSet: ${indexSetVal}`);
                    console.log(`Encoding: solidityPacked ["bytes32", "bytes32", "uint256"]`);
                    return;
                }
            }

            // Type 2: solidityPackedKeccak256 with ["bytes32", "bytes32", "bytes32"] (meaning indexSet is packed as 32-byte bytes32)
            {
                const indexSetBytes = ethers.zeroPadValue(ethers.toBeHex(indexSetVal), 32);
                const collectionId = ethers.solidityPackedKeccak256(
                    ["bytes32", "bytes32", "bytes32"],
                    [parentCollectionId, conditionId, indexSetBytes]
                );
                const tokenId = ethers.solidityPackedKeccak256(
                    ["address", "bytes32"],
                    [collateralAddr, collectionId]
                );
                if (tokenId === "0x" + targetTokenId) {
                    console.log(`MATCH FOUND!`);
                    console.log(`Collateral: ${collateralAddr}`);
                    console.log(`IndexSet: ${indexSetVal}`);
                    console.log(`Encoding: solidityPacked ["bytes32", "bytes32", "bytes32"]`);
                    return;
                }
            }

            // Type 3: standard abi.encode (all arguments 32-byte padded)
            {
                const indexSetBytes = ethers.zeroPadValue(ethers.toBeHex(indexSetVal), 32);
                const abiCoder = ethers.AbiCoder.defaultAbiCoder();
                const collectionId = ethers.keccak256(
                    abiCoder.encode(
                        ["bytes32", "bytes32", "uint256"],
                        [parentCollectionId, conditionId, indexSetVal]
                    )
                );
                const tokenId = ethers.keccak256(
                    abiCoder.encode(
                        ["address", "bytes32"],
                        [collateralAddr, collectionId]
                    )
                );
                if (tokenId === "0x" + targetTokenId) {
                    console.log(`MATCH FOUND!`);
                    console.log(`Collateral: ${collateralAddr}`);
                    console.log(`IndexSet: ${indexSetVal}`);
                    console.log(`Encoding: abi.encode ["bytes32", "bytes32", "uint256"] / ["address", "bytes32"]`);
                    return;
                }
            }

            // Type 4: combination of abi.encode for collectionId and solidityPacked for tokenId
            {
                const abiCoder = ethers.AbiCoder.defaultAbiCoder();
                const collectionId = ethers.keccak256(
                    abiCoder.encode(
                        ["bytes32", "bytes32", "uint256"],
                        [parentCollectionId, conditionId, indexSetVal]
                    )
                );
                const tokenId = ethers.solidityPackedKeccak256(
                    ["address", "bytes32"],
                    [collateralAddr, collectionId]
                );
                if (tokenId === "0x" + targetTokenId) {
                    console.log(`MATCH FOUND!`);
                    console.log(`Collateral: ${collateralAddr}`);
                    console.log(`IndexSet: ${indexSetVal}`);
                    console.log(`Encoding: abi.encode collectionId and solidityPacked tokenId`);
                    return;
                }
            }
        }
    }
    console.log("No match found.");
}

main().catch(console.error);
