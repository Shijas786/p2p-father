import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL);
    if (!process.env.RELAYER_PRIVATE_KEY) {
        console.error("No RELAYER_PRIVATE_KEY in env");
        return;
    }
    const signer = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
    
    console.log("Signer address:", signer.address);
    const balance = await provider.getBalance(signer.address);
    console.log("Signer balance:", ethers.formatEther(balance), "BNB");
    
    try {
        console.log("Sending test transaction with 0.05 Gwei gas price...");
        const tx = await signer.sendTransaction({
            to: signer.address,
            value: 0n,
            gasPrice: ethers.parseUnits("0.05", "gwei"),
            gasLimit: 21000n
        });
        console.log("Transaction Broadcasted! Hash:", tx.hash);
        const receipt = await tx.wait();
        console.log("Transaction Mined! Gas Used:", receipt?.gasUsed.toString());
    } catch (e: any) {
        console.error("FAILED to send transaction:", e.message);
    }
}

main().catch(console.error);
