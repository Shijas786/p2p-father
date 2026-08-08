import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = "https://bsc-dataseed1.binance.org/";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

const CONTRACTS = [
    "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a",
    "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a"
];

const ERC20_ABI = [
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "function balanceOf(address) view returns (uint256)"
];

async function main() {
    console.log("🔍 Searching for 1.25 USDT transfers to BSC contracts...");
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const usdt = new ethers.Contract(BSC_USDT, ERC20_ABI, provider);

    const currentBlock = await provider.getBlockNumber();
    const startBlock = currentBlock - 5000; // ~4 hours

    for (const c of CONTRACTS) {
        console.log(`\nScanning contract: ${c}...`);
        const bal = await usdt.balanceOf(c);
        console.log(`Current ERC20 USDT Balance: ${ethers.formatUnits(bal, 18)} USDT`);

        const filter = usdt.filters.Transfer(null, c);
        const events = await usdt.queryFilter(filter, startBlock, currentBlock);

        console.log(`Found ${events.length} incoming USDT transfers in last 5000 blocks:`);
        for (const e of events) {
            const log = e as ethers.EventLog;
            const from = log.args[0];
            const amount = log.args[2];
            console.log(`  - Tx: ${log.transactionHash} | From: ${from} | Amount: ${ethers.formatUnits(amount, 18)} USDT`);
        }
    }
}

main().catch(console.error);
