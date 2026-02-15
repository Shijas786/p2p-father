
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
    const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
    const contractAddress = '0x78c2B85759C5F7d58fEea82D0Be098E540272245';
    const userAddress = '0x6C31212a23040998E1D1c157ACe3982aBDBE3154'; // cryptowolf07
    const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

    const abi = ["function balances(address user, address token) view returns (uint256)"];
    const contract = new ethers.Contract(contractAddress, abi, provider);

    console.log(`Checking balance for User: ${userAddress}`);
    console.log(`Checking balance for Token: ${usdcAddress}`);

    const balance = await contract.balances(userAddress, usdcAddress);
    console.log(`\nRaw Mapping Balance: ${balance.toString()}`);
    console.log(`Formatted Balance (6 decimals): ${ethers.formatUnits(balance, 6)}`);

    // Check with other common USDC addresses just in case
    const testnetUSDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
    const altBalance = await contract.balances(userAddress, testnetUSDC);
    console.log(`Raw Mapping Balance (Sepolia/Alt USDC): ${altBalance.toString()}`);
}

main();
