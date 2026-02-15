import { ethers } from 'ethers';
import { env } from '../src/config/env';

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

async function main() {
    const userAddress = '0x08FFc32adA724BEAE008f5C08bb1C06c1a737e10';
    const escrowAddress = '0x78c2B85759C5F7d58fEea82D0Be098E540272245';
    const tokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC Mainnet

    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    const [balance, allowance] = await Promise.all([
        contract.balanceOf(userAddress),
        contract.allowance(userAddress, escrowAddress)
    ]);

    console.log(`USDC Units (Wei):`);
    console.log(`Balance  : ${balance.toString()}`);
    console.log(`Allowance: ${allowance.toString()}`);

    const targetAmount = 1000000n;
    if (allowance >= targetAmount) {
        console.log("Allowance is SUFFICIENT for 1.0 USDC.");
    } else {
        console.log(`Allowance is INSUFFICIENT! Need ${targetAmount}, have ${allowance}`);
    }
}

main().catch(console.error);
