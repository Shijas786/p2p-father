import { ethers } from 'ethers';
import { env } from '../src/config/env';

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

async function main() {
    const userAddress = '0x08FFc32adA724BEAE008f5C08bb1C06c1a737e10';
    const escrowAddress = '0x78c2B85759C5F7d58fEea82D0Be098E540272245';
    const tokenAddress = env.USDC_ADDRESS;

    console.log(`Checking Base Network:`);
    console.log(`User: ${userAddress}`);
    console.log(`Escrow: ${escrowAddress}`);
    console.log(`Token: ${tokenAddress}`);

    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    const [balance, allowance, decimals] = await Promise.all([
        contract.balanceOf(userAddress),
        contract.allowance(userAddress, escrowAddress),
        contract.decimals()
    ]);

    console.log(`\nResults:`);
    console.log(`Balance: ${ethers.formatUnits(balance, decimals)} USDC`);
    console.log(`Allowance: ${ethers.formatUnits(allowance, decimals)} USDC`);

    const ethBalance = await provider.getBalance(userAddress);
    console.log(`ETH Balance: ${ethers.formatEther(ethBalance)} ETH`);
}

main().catch(console.error);
