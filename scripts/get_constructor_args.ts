
const { ethers } = require("ethers");

async function main() {
    const feeCollector = "0x3A5668F8B3E167771d503F0321c42a7B082789Ef";
    const usdc = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"; // BSC

    const defaultAbiCoder = new ethers.AbiCoder();
    const encoded = defaultAbiCoder.encode(["address", "address"], [feeCollector, usdc]);

    console.log("ABI Encoded Arguments:");
    console.log(encoded.slice(2)); // Remove 0x prefix
}

main().catch(console.error);
