import { ethers } from 'ethers';

const rpcUrls: any = {
    'base': 'https://mainnet.base.org',
    'bsc': 'https://bsc-dataseed.binance.org'
};

async function main() {
    // 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2 is USDT on Base
    const provider = new ethers.JsonRpcProvider(rpcUrls['base']);
    // Wait, I need the bot wallet private key to check balance?
    // Actually, I just need the bot wallet address. 
    // Is the bot wallet address in the sqlite db?
}
main().catch(console.error);
