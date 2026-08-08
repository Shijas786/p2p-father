import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = "https://bsc-dataseed1.binance.org/";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const RELAYER_ADDRESS = "0x3A5668F8B3E167771d503F0321c42a7B082789Ef";

const ERC20_ABI = [
    "event Transfer(address indexed from, address indexed to, uint256 value)"
];

async function main() {
    console.log("🔍 Scanning recent USDT transfers from Relayer Wallet on BSC...");
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const usdt = new ethers.Contract(BSC_USDT, ERC20_ABI, provider);

    const currentBlock = await provider.getBlockNumber();
    console.log(`Current Block: ${currentBlock}`);

    // Query last 1000 blocks in chunks of 50
    const chunkSize = 50;
    const totalBlocks = 1000;
    const filter = usdt.filters.Transfer(RELAYER_ADDRESS, null);

    let allEvents: any[] = [];
    for (let b = currentBlock - totalBlocks; b < currentBlock; b += chunkSize) {
        const toB = Math.min(b + chunkSize - 1, currentBlock);
        try {
            const events = await usdt.queryFilter(filter, b, toB);
            allEvents.push(...events);
        } catch (err: any) {
            // ignore chunk error
        }
    }

    console.log(`Found ${allEvents.length} USDT transfer events in the last ~1000 blocks:\n`);

    for (const e of allEvents) {
        const log = e as ethers.EventLog;
        const to = log.args[1];
        const val = log.args[2];
        console.log(`Tx: ${log.transactionHash} | Block: ${log.blockNumber}`);
        console.log(`  To:     ${to}`);
        console.log(`  Amount: ${ethers.formatUnits(val, 18)} USDT`);
        console.log(`--------------------------------------------------`);
    }
}

main().catch(console.error);
