const { ethers } = require('ethers');
async function main() {
    const provider = new ethers.JsonRpcProvider('https://bnb-mainnet.g.alchemy.com/v2/sw59DoGWlBSmzxHbuFSNY');
    const feeData = await provider.getFeeData();
    console.log(feeData);
}
main().catch(console.error);
