import { wallet } from '../src/services/wallet';
import { env } from '../src/config/env';
import { ethers } from 'ethers';

const ERC20_ABI = [
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

async function main() {
    const userIndex = 2;
    const derived = wallet.deriveWallet(userIndex);
    console.log(`Derived Address (Index ${userIndex}): ${derived.address}`);

    const targetAddress = '0x08FFc32adA724BEAE008f5C08bb1C06c1a737e10';
    if (derived.address.toLowerCase() === targetAddress.toLowerCase()) {
        console.log("Matches the address in the screenshot!");
    } else {
        console.log(`MISMATCH! Expected ${targetAddress}`);
    }

    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const tokenContract = new ethers.Contract(env.USDC_ADDRESS, ERC20_ABI, provider);
    const escrowAddress = env.ESCROW_CONTRACT_ADDRESS;

    const allowance = await tokenContract.allowance(derived.address, escrowAddress);
    const decimals = await tokenContract.decimals();

    console.log(`Allowance for Escrow (${escrowAddress}): ${ethers.formatUnits(allowance, decimals)} USDC`);

    // Check if there's any pending or previous trade that might have consumed allowance?
    // No, allowance check is instantaneous.
}

main().catch(console.error);
