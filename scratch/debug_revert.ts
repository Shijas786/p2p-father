import { ethers } from "ethers";

const POLYGON_RPC = "https://polygon.llamarpc.com";
const txHash = "0xb58b88d34e6dcee63a254cfd185e67883e0b9ebfef7cb3f11e19b215eE11B267";

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    
    // Get the transaction to inspect its input data and parameters
    const tx = await provider.getTransaction(txHash);
    if (!tx) {
        console.error("Transaction not found");
        return;
    }
    
    console.log("Tx Input Data:", tx.data);

    // Simulation to find revert reason
    try {
        console.log("Simulating transaction to find revert reason...");
        const code = await provider.call({
            to: tx.to,
            from: tx.from,
            data: tx.data,
            gasLimit: tx.gasLimit,
            gasPrice: tx.gasPrice,
            value: tx.value,
            blockTag: tx.blockNumber ? tx.blockNumber - 1 : "latest"
        });
        console.log("Simulation returned code:", code);
    } catch (simErr: any) {
        console.error("\nRevert Reason:", simErr.message);
    }
}

main().catch(console.error);
