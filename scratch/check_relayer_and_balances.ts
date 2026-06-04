import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";

const proxyAddress96 = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799"; // Source wallet (index 96)
const proxyAddress0 = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02"; // Dest wallet (index 0)
const relayerTxHash = "0xa5a3e58bb1e5c8227c083469a0bb222ecf3ce552d191de958ea3ebd6ee68c17";

async function main() {
    console.log(`Using RPC: ${POLYGON_RPC}`);
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);

    // 1. Check balances
    const pusd = new ethers.Contract(PUSD_ADDRESS, [
        "function balanceOf(address) view returns (uint256)"
    ], provider);

    const balance96 = await pusd.balanceOf(proxyAddress96);
    const balance0 = await pusd.balanceOf(proxyAddress0);

    console.log(`\n--- Balances ---`);
    console.log(`Proxy 96 (${proxyAddress96}): ${ethers.formatUnits(balance96, 6)} pUSD`);
    console.log(`Proxy 0  (${proxyAddress0}): ${ethers.formatUnits(balance0, 6)} pUSD`);

    // 2. Check transaction status
    console.log(`\n--- Tx Status for ${relayerTxHash} ---`);
    try {
        const receipt = await provider.getTransactionReceipt(relayerTxHash);
        if (receipt) {
            console.log(`Transaction Status: ${receipt.status === 1 ? "SUCCESS" : "FAILED"}`);
            console.log(`Block Number: ${receipt.blockNumber}`);
        } else {
            console.log(`Transaction NOT found on-chain.`);
            const tx = await provider.getTransaction(relayerTxHash);
            if (tx) {
                console.log(`Transaction is pending in mempool.`);
            } else {
                console.log(`Transaction is not in mempool (might be dropped or the relayer hasn't submitted it yet).`);
            }
        }
    } catch (e: any) {
        console.error(`Error querying transaction:`, e.message);
    }
}

main().catch(console.error);
