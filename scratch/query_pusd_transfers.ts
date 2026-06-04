import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";

const addresses = [
    "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799", // Index 0 EOA
    "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02", // Index 0 Proxy
    "0x7CeDA838EA2aB6305C1332A69b0E1B5806CE95C0", // Index 96 EOA
    "0xa1f77D1BD604C6290b7b88d34E6DCEe63a254cFD"  // Index 96 Proxy
];

async function main() {
    console.log(`Using RPC: ${POLYGON_RPC}`);
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);

    const filterTopic = ethers.id("Transfer(address,address,uint256)");

    console.log(`Querying Transfer logs for PUSD contract (${PUSD_ADDRESS}) for the last 150,000 blocks...`);
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = latestBlock - 150000;

    const logs = await provider.getLogs({
        address: PUSD_ADDRESS,
        topics: [filterTopic],
        fromBlock: fromBlock,
        toBlock: latestBlock
    });

    console.log(`Found ${logs.length} total transfers in the block range.`);

    for (const log of logs) {
        try {
            const from = ethers.getAddress("0x" + log.topics[1].slice(26));
            const to = ethers.getAddress("0x" + log.topics[2].slice(26));
            const value = BigInt(log.data === "0x" ? 0 : log.data);

            const isFromTarget = addresses.some(addr => addr.toLowerCase() === from.toLowerCase());
            const isToTarget = addresses.some(addr => addr.toLowerCase() === to.toLowerCase());

            if (isFromTarget || isToTarget) {
                console.log(`\n[Block ${log.blockNumber}] Tx: ${log.transactionHash}`);
                console.log(`  From:  ${from} ${addresses.includes(from) ? "(Target)" : ""}`);
                console.log(`  To:    ${to} ${addresses.includes(to) ? "(Target)" : ""}`);
                console.log(`  Value: ${ethers.formatUnits(value, 6)} pUSD`);
            }
        } catch (e: any) {
            // Skip decoding errors
        }
    }
}

main().catch(console.error);
