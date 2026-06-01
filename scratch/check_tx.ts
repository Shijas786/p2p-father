import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL);
    const tx = await provider.getTransaction("0x7f32b41c10d2b3ffe5e02b490a75250c146389c04bf53b2bcf2ceea673dc0c33");
    const receipt = await provider.getTransactionReceipt("0x7f32b41c10d2b3ffe5e02b490a75250c146389c04bf53b2bcf2ceea673dc0c33");
    
    console.log("Transaction Hash:", tx?.hash);
    console.log("From:", tx?.from);
    console.log("To (Contract):", tx?.to);
    
    if (tx && receipt) {
        const gasUsed = receipt.gasUsed;
        const gasPrice = tx.gasPrice || 0n;
        const feeWei = gasUsed * gasPrice;
        const feeEth = ethers.formatEther(feeWei);
        console.log(`Gas Used: ${gasUsed.toString()}`);
        console.log(`Gas Price: ${ethers.formatUnits(gasPrice, "gwei")} Gwei`);
        console.log(`Transaction Fee: ${feeEth} BNB`);
        
        // Use a conservative $600 BNB price for estimation
        const bnbPrice = 600; 
        const feeUsd = parseFloat(feeEth) * bnbPrice;
        console.log(`Estimated Fee in USD (at $${bnbPrice}/BNB): $${feeUsd.toFixed(4)}`);
        
        // Let's decode the inputs if possible
        console.log("Data Payload:", tx.data);
    }
}

main().catch(console.error);
