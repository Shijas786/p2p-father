const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
    const BSC_RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';
    const ESCROW_BSC = process.env.ESCROW_CONTRACT_ADDRESS_BSC;
    
    const providerBsc = new ethers.JsonRpcProvider(BSC_RPC);
    const ERC20_ABI = ["function balanceOf(address owner) view returns (uint256)"];
    
    const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
    const tokenContract = new ethers.Contract(USDT_BSC, ERC20_ABI, providerBsc);
    
    const physicalBalance = await tokenContract.balanceOf(ESCROW_BSC);
    console.log("Escrow Contract physical USDT on BSC:", ethers.formatUnits(physicalBalance, 18));
}

main().catch(console.error);
