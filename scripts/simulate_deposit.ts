import { wallet } from '../src/services/wallet';
import { env } from '../src/config/env';

async function main() {
    const userIndex = 2; // gorilla_m1
    const amount = "1.0";
    const tokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const chain = 'base';

    console.log(`Simulating deposit for user index ${userIndex}...`);
    console.log(`Amount: ${amount} USDC`);
    console.log(`Chain: ${chain}`);

    try {
        const txHash = await wallet.depositToVault(userIndex, amount, tokenAddress, chain as any);
        console.log(`SUCCESS! Tx Hash: ${txHash}`);
    } catch (err: any) {
        console.error('DEPOSIT FAILED:');
        console.error(err);
    }
}

main().catch(console.error);
