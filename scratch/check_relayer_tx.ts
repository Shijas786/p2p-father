import { ethers } from "ethers";

async function main() {
    console.log("=== Checking On-Chain BSC Transaction Details ===");
    const txHash = "0xcf38a71a70ba2077244b4de7fd6d34d1eaa95eb3c9e91c780101afd0e6fa59b4";
    
    const rpcUrls = [
        "https://bsc-dataseed1.binance.org",
        "https://bsc-dataseed.binance.org",
        "https://rpc.ankr.com/bsc"
    ];

    let provider: ethers.JsonRpcProvider | null = null;
    for (const url of rpcUrls) {
        try {
            provider = new ethers.JsonRpcProvider(url);
            await provider.getBlockNumber();
            console.log(`Connected to RPC: ${url}`);
            break;
        } catch {
            continue;
        }
    }

    if (!provider) {
        console.error("Failed to connect to BSC RPC");
        return;
    }

    const tx = await provider.getTransaction(txHash);
    const receipt = await provider.getTransactionReceipt(txHash);

    console.log("\nTransaction Summary:");
    console.log(`Tx Hash: ${txHash}`);
    console.log(`From (Relayer): ${receipt?.from}`);
    console.log(`To (Escrow Contract): ${receipt?.to}`);
    console.log(`Status: ${receipt?.status === 1 ? "✅ SUCCESS" : "❌ FAILED"}`);
    console.log(`Block Number: ${receipt?.blockNumber}`);

    // Parse ERC20 Transfer events in logs
    const erc20TransferTopic = ethers.id("Transfer(address,address,uint256)");
    console.log("\nERC20 Transfer Events in Tx Logs:");
    for (const log of receipt?.logs || []) {
        if (log.topics[0] === erc20TransferTopic) {
            const from = ethers.stripZerosLeft(log.topics[1]);
            const to = ethers.stripZerosLeft(log.topics[2]);
            const value = ethers.formatUnits(log.data, 18); // USDT on BSC is 18 decimals
            console.log(`  Transfer: ${from} ➔ ${to} | Amount: ${value} USDT (Token: ${log.address})`);
        }
    }
}

main().catch(console.error);
