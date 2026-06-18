const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
    const userAddress = "0x1B0C5760a300358FA52a2bD58e4859EB9fb9ab79"; 
    const BSC_RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';
    const ESCROW_BSC = process.env.ESCROW_CONTRACT_ADDRESS_BSC;
    
    // Fake the wallet so we can estimate gas
    const providerBsc = new ethers.JsonRpcProvider(BSC_RPC);
    const ESCROW_ABI = [{"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"}];
    const contractBsc = new ethers.Contract(ESCROW_BSC, ESCROW_ABI, providerBsc);
    
    const tokenAddress = "0x55d398326f99059fF775485246999027B3197955";
    const amountUnits = ethers.parseUnits("60", 18);
    
    try {
        console.log("Estimating gas...");
        const gas = await contractBsc.withdraw.estimateGas(tokenAddress, amountUnits, { from: userAddress });
        console.log("Estimated Gas:", gas.toString());
        
        const feeData = await providerBsc.getFeeData();
        console.log("Fee Data:", feeData);
        
        const cost = gas * feeData.gasPrice;
        console.log("Total Cost (wei):", cost.toString());
        console.log("Total Cost (BNB):", ethers.formatEther(cost));
        
        const bal = await providerBsc.getBalance(userAddress);
        console.log("User BNB:", ethers.formatEther(bal));
        
        if (cost > bal) {
            console.log("ERROR: Cost > Balance!");
        } else {
            console.log("Balance is sufficient for gas.");
        }
    } catch(err) {
        console.error("Estimation failed:", err.message || err);
        console.error(err);
    }
}

main().catch(console.error);
