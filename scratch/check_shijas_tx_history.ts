import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
const proxyAddress = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";

async function main() {
    console.log(`Connecting to Polygon RPC: ${POLYGON_RPC}`);
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);

    // Get current transaction count (nonce)
    const nonce = await provider.getTransactionCount(proxyAddress);
    console.log(`Proxy Wallet Nonce (Transaction count): ${nonce}`);

    // Fetch block number
    const blockNum = await provider.getBlockNumber();
    console.log(`Current Block Number: ${blockNum}`);

    // Since getLogs is capped, let's scan the last 100 blocks for any logs matching proxyAddress
    console.log("Scanning last 100 blocks for proxy transactions...");
    const logs = await provider.getLogs({
        fromBlock: blockNum - 100,
        toBlock: "latest",
        topics: [
            null, // any event
            ethers.zeroPadValue(proxyAddress, 32) // proxyAddress as topic1 (e.g. sender/receiver)
        ]
    }).catch(e => {
        console.error("Logs fetch failed:", e.message);
        return [];
    });

    console.log(`Found ${logs.length} log entries in the last 100 blocks:`);
    for (const log of logs) {
        console.log(`Contract: ${log.address}, TxHash: ${log.transactionHash}, Block: ${log.blockNumber}`);
    }

    // Let's also check Biconomy Relayer or relayer EOA balance
    const relayerAddress = "0x3A5668F8B3E167771d503F0321c42a7B082789Ef";
    const relayerBalance = await provider.getBalance(relayerAddress);
    console.log(`Relayer EOA Balance: ${ethers.formatEther(relayerBalance)} MATIC/POL`);
}

main().catch(console.error);
