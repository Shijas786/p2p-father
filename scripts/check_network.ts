import { ethers } from 'ethers';
import { env } from '../src/config/env';

async function main() {
    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const network = await provider.getNetwork();
    const block = await provider.getBlockNumber();

    console.log(`BASE_RPC_URL: ${env.BASE_RPC_URL}`);
    console.log(`Network Name: ${network.name}`);
    console.log(`Chain ID: ${network.chainId}`);
    console.log(`Current Block: ${block}`);
}

main().catch(console.error);
