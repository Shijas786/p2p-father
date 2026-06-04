import { ethers } from "ethers";

const POLYGON_RPC = "https://polygon.llamarpc.com";
const txHash = "0xb58b88d34e6dcee63a254cfd185e67883e0b9ebfef7cb3f11e19b215eE11B267";

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const tx = await provider.getTransaction(txHash);
    if (!tx) {
        console.error("Transaction not found");
        return;
    }

    try {
        console.log("Simulating call...");
        await provider.call({
            to: tx.to,
            from: tx.from,
            data: tx.data,
            gasLimit: tx.gasLimit,
            gasPrice: tx.gasPrice,
            value: tx.value,
            blockTag: tx.blockNumber ? tx.blockNumber - 1 : "latest"
        });
        console.log("Call completed without revert");
    } catch (err: any) {
        console.log("Full error keys:", Object.keys(err));
        console.log("Error code:", err.code);
        console.log("Error message:", err.message);
        
        // Let's dump all sub-properties
        if (err.info) console.log("err.info:", JSON.stringify(err.info, null, 2));
        if (err.data) console.log("err.data:", err.data);
        if (err.error) {
            console.log("err.error keys:", Object.keys(err.error));
            console.log("err.error.message:", err.error.message);
            console.log("err.error.data:", err.error.data);
            console.log("err.error:", JSON.stringify(err.error, null, 2));
        }
    }
}

main().catch(console.error);
