import { ethers } from "ethers";

const POLYGON_RPC = "https://polygon.llamarpc.com";
const txHash = "0xa5a3e58bb1e5c8227c083469a0bb222ecf3ce552d191de958ea3ebd6ee68c17";

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) {
        console.log(`Transaction Status: ${receipt.status === 1 ? "SUCCESS" : "FAILED"}`);
        console.log(`Block Number: ${receipt.blockNumber}`);
    } else {
        console.log("Transaction not found on Polygon (still pending or dropped)");
    }
}

main().catch(console.error);
