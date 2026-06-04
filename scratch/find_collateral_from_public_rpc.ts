import { ethers } from "ethers";

const PUBLIC_RPC = "https://polygon-rpc.com";
const CTF_ADDRESS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
const conditionId = "0x67405fbc8945726be558126fcd7b8a5eae83bea9f8f4f71582e3ec2ffafad384";

async function main() {
    console.log(`Using Public RPC: ${PUBLIC_RPC}`);
    const provider = new ethers.JsonRpcProvider(PUBLIC_RPC);

    // Event signature: PositionSplit(address,address,bytes32,bytes32,uint256[],uint256)
    // We filter by topic[3] = conditionId
    const filterTopic = ethers.id("PositionSplit(address,address,bytes32,bytes32,uint256[],uint256)");
    const conditionTopic = conditionId;

    const latestBlock = await provider.getBlockNumber();
    console.log(`Latest block: ${latestBlock}`);

    // Query in batches of 5000 blocks to avoid RPC timeout, looking back ~50,000 blocks
    const batchSize = 5000;
    const lookback = 80000;
    const startBlock = latestBlock - lookback;

    console.log(`Searching from block ${startBlock} to ${latestBlock}...`);

    for (let from = startBlock; from < latestBlock; from += batchSize) {
        const to = Math.min(from + batchSize - 1, latestBlock);
        try {
            const logs = await provider.getLogs({
                address: CTF_ADDRESS,
                topics: [filterTopic, null, null, conditionTopic],
                fromBlock: from,
                toBlock: to
            });

            if (logs.length > 0) {
                console.log(`Found ${logs.length} logs in block range ${from} - ${to}:`);
                for (const log of logs) {
                    // Topics:
                    // 0: PositionSplit signature
                    // 1: stakeholder (address)
                    // 2: collateralToken (address)
                    // 3: conditionId (bytes32)
                    const stakeholder = ethers.getAddress("0x" + log.topics[1].slice(26));
                    const collateralToken = ethers.getAddress("0x" + log.topics[2].slice(26));
                    console.log(`  Stakeholder: ${stakeholder}`);
                    console.log(`  Collateral Token: ${collateralToken}`);
                    console.log(`  Tx: ${log.transactionHash}`);
                    return; // Found it!
                }
            }
        } catch (e: any) {
            console.warn(`Error querying blocks ${from} - ${to}:`, e.message);
        }
    }
    console.log("No PositionSplit logs found in the search range.");
}

main().catch(console.error);
