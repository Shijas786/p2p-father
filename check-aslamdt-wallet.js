const { ethers } = require('ethers');

async function check() {
    const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
    const walletAddress = "0x1B0C5760a300358FA52a2bD58e4859EB9fb9ab79";
    
    const ERC20_ABI = ["function balanceOf(address owner) view returns (uint256)"];
    
    // USDT on Base
    const USDT_ADDRESS = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";
    const usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);
    const usdtBal = await usdtContract.balanceOf(walletAddress);
    console.log(`  Wallet USDT Balance: ${ethers.formatUnits(usdtBal, 6)} USDT`);
    
    // USDC on Base
    const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
    const usdcBal = await usdcContract.balanceOf(walletAddress);
    console.log(`  Wallet USDC Balance: ${ethers.formatUnits(usdcBal, 6)} USDC`);
}

check().catch(console.error);
