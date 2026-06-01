import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = process.env.BSC_RPC_URL;
const ESCROW_OLD = "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";
const ESCROW_NEW = "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a";
const USER = "0x6c31212a23040998e1d1c157ace3982abdbe3154";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

const ESCROW_ABI = [
    "function balances(address user, address token) view returns (uint256)",
    "event Deposit(address indexed user, address indexed token, uint256 amount)"
];

async function main() {
    if (!BSC_RPC_URL) return;
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    
    // User Balances
    const bnbBal = await provider.getBalance(USER);
    console.log(`[USER] BNB Balance: ${ethers.formatEther(bnbBal)}`);
    
    const usdtContract = new ethers.Contract(BSC_USDT, ERC20_ABI, provider);
    const usdtBal = await usdtContract.balanceOf(USER);
    console.log(`[USER] USDT Balance: ${ethers.formatUnits(usdtBal, 18)}`);

    // Allowances
    const allowOld = await usdtContract.allowance(USER, ESCROW_OLD);
    console.log(`[ALLOWANCE] Old Escrow: ${ethers.formatUnits(allowOld, 18)}`);

    const allowNew = await usdtContract.allowance(USER, ESCROW_NEW);
    console.log(`[ALLOWANCE] New Escrow: ${ethers.formatUnits(allowNew, 18)}`);

    // Escrow Balances
    const escrowOld = new ethers.Contract(ESCROW_OLD, ESCROW_ABI, provider);
    const vaultBalOld = await escrowOld.balances(USER, BSC_USDT);
    console.log(`[VAULT] Old Escrow: ${ethers.formatUnits(vaultBalOld, 18)}`);

    const escrowNew = new ethers.Contract(ESCROW_NEW, ESCROW_ABI, provider);
    const vaultBalNew = await escrowNew.balances(USER, BSC_USDT);
    console.log(`[VAULT] New Escrow: ${ethers.formatUnits(vaultBalNew, 18)}`);

    // Scan last 10 blocks for Deposit events
    const blockNumber = await provider.getBlockNumber();
    console.log(`\nScanning blocks ${blockNumber - 10} to ${blockNumber} for Deposit events...`);
    
    try {
        const filterOld = escrowOld.filters.Deposit(USER);
        const eventsOld = await escrowOld.queryFilter(filterOld, blockNumber - 10, blockNumber);
        console.log(`OLD Escrow Deposit events: ${eventsOld.length}`);
        for (const e of eventsOld) {
            if ('args' in e && e.args) {
                console.log(`  - Amount: ${ethers.formatUnits(e.args.amount, 18)}, Tx: ${e.transactionHash}`);
            }
        }
    } catch (e: any) {
        console.error("Old scan failed:", e.message);
    }

    try {
        const filterNew = escrowNew.filters.Deposit(USER);
        const eventsNew = await escrowNew.queryFilter(filterNew, blockNumber - 10, blockNumber);
        console.log(`NEW Escrow Deposit events: ${eventsNew.length}`);
        for (const e of eventsNew) {
            if ('args' in e && e.args) {
                console.log(`  - Amount: ${ethers.formatUnits(e.args.amount, 18)}, Tx: ${e.transactionHash}`);
            }
        }
    } catch (e: any) {
        console.error("New scan failed:", e.message);
    }
}

main();
