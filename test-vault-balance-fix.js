const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
    const userAddress = "0x1B0C5760a300358FA52a2bD58e4859EB9fb9ab79"; // aslamdt
    const USDT_BASE = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";
    const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
    
    const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    const BSC_RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';
    
    const ESCROW_BASE = process.env.ESCROW_CONTRACT_ADDRESS;
    const ESCROW_BSC = process.env.ESCROW_CONTRACT_ADDRESS_BSC;
    
    console.log("BASE_RPC:", BASE_RPC);
    console.log("BSC_RPC:", BSC_RPC);
    console.log("ESCROW_BASE:", ESCROW_BASE);
    console.log("ESCROW_BSC:", ESCROW_BSC);
    
    const ESCROW_ABI = [{"inputs":[{"internalType":"address","name":"user","type":"address"},{"internalType":"address","name":"token","type":"address"}],"name":"balances","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}];
    
    const providerBase = new ethers.JsonRpcProvider(BASE_RPC);
    const providerBsc = new ethers.JsonRpcProvider(BSC_RPC);
    
    const contractBase = new ethers.Contract(ESCROW_BASE, ESCROW_ABI, providerBase);
    const contractBsc = new ethers.Contract(ESCROW_BSC, ESCROW_ABI, providerBsc);
    
    const balBase = await contractBase.balances(userAddress, USDT_BASE);
    console.log("Backend Vault Base USDT:", ethers.formatUnits(balBase, 6));
    
    const balBsc = await contractBsc.balances(userAddress, USDT_BSC);
    console.log("Backend Vault BSC USDT:", ethers.formatUnits(balBsc, 18));
}

main().catch(console.error);
