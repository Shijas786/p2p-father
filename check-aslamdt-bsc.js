const { ethers } = require('ethers');

async function check() {
    const providerBase = new ethers.JsonRpcProvider('https://mainnet.base.org');
    const providerBsc = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org');
    const walletAddress = "0x1B0C5760a300358FA52a2bD58e4859EB9fb9ab79"; // aslamdt
    
    const ESCROW_ABI = [{"inputs":[{"internalType":"address","name":"user","type":"address"},{"internalType":"address","name":"token","type":"address"}],"name":"balances","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}];
    const escrowBase = new ethers.Contract("0xf20872C359788a53958a048413D64F183403B1f1", ESCROW_ABI, providerBase);
    const escrowBsc = new ethers.Contract("0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a", ESCROW_ABI, providerBsc);
    
    // Base USDT
    const vaultUsdtBase = await escrowBase.balances(walletAddress, "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2");
    console.log(`Vault USDT (Base): ${ethers.formatUnits(vaultUsdtBase, 6)}`);
    
    // BSC USDT
    const vaultUsdtBsc = await escrowBsc.balances(walletAddress, "0x55d398326f99059fF775485246999027B3197955");
    console.log(`Vault USDT (BSC): ${ethers.formatUnits(vaultUsdtBsc, 18)}`);

    // BSC USDC
    const vaultUsdcBsc = await escrowBsc.balances(walletAddress, "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d");
    console.log(`Vault USDC (BSC): ${ethers.formatUnits(vaultUsdcBsc, 18)}`);
    
    // BSC BNB
    const vaultBnbBsc = await escrowBsc.balances(walletAddress, "0x0000000000000000000000000000000000000000");
    console.log(`Vault BNB (BSC): ${ethers.formatUnits(vaultBnbBsc, 18)}`);
    
    // ETH on BSC (Gas)
    const balBsc = await providerBsc.getBalance(walletAddress);
    console.log(`BNB Balance (Gas): ${ethers.formatEther(balBsc)}`);
}

check().catch(console.error);
