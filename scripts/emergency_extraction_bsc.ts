import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = process.env.BSC_RPC_URL;
const ADMIN_WALLET_ADDRESS = process.env.ADMIN_WALLET_ADDRESS;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;

// The contract address provided by user
const ESCROW_BSC = "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";

const BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_BNB = "0x0000000000000000000000000000000000000000";

const ESCROW_ABI = [
    "event Deposit(address indexed user, address indexed token, uint256 amount)",
    "event Withdraw(address indexed user, address indexed token, uint256 amount)",
    "function balances(address user, address token) view returns (uint256)",
    "function totalVaultBalances(address token) view returns (uint256)",
    "function createTradeByRelayer(address _seller, address _buyer, address _token, uint256 _amount, uint256 _duration) returns (uint256)",
    "function refund(uint256 _tradeId)"
];

async function scanVaultBalances() {
    console.log("Connecting to BSC...");
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const contract = new ethers.Contract(ESCROW_BSC, ESCROW_ABI, provider);

    console.log("Fetching Deposit and Withdraw events from BSC...");
    // Let's fetch events from the last 100,000 blocks (or a wider range if needed)
    // The contract was likely deployed recently, but to be safe we scan a large range.
    // BSC blocks are 3 seconds. 30 days = 864000 blocks.
    const currentBlock = await provider.getBlockNumber();
    const startBlock = currentBlock - 500000; // ~17 days ago

    const depositFilter = contract.filters.Deposit();
    const deposits = await contract.queryFilter(depositFilter, startBlock, currentBlock);
    
    const users = new Set<string>();
    deposits.forEach((event: any) => {
        users.add(event.args.user);
    });

    console.log(`Found ${users.size} unique users who deposited.`);

    const userBalances: any[] = [];
    let totalUsdc = 0n;
    let totalUsdt = 0n;

    for (const user of Array.from(users)) {
        const usdcBal = await contract.balances(user, BSC_USDC);
        const usdtBal = await contract.balances(user, BSC_USDT);
        const bnbBal = await contract.balances(user, BSC_BNB);

        if (usdcBal > 0n || usdtBal > 0n || bnbBal > 0n) {
            totalUsdc += usdcBal;
            totalUsdt += usdtBal;

            userBalances.push({
                user,
                USDC: ethers.formatEther(usdcBal),
                USDT: ethers.formatEther(usdtBal),
                BNB: ethers.formatEther(bnbBal)
            });
        }
    }

    console.log("\n==================================================");
    console.log("DRY RUN: Users with Stuck Vault Funds");
    console.log("==================================================");
    
    if (userBalances.length === 0) {
        console.log("No stuck funds found for any user.");
    } else {
        console.table(userBalances);
    }

    console.log("\nTotal Stuck USDC identified:", ethers.formatEther(totalUsdc));
    console.log("Total Stuck USDT identified:", ethers.formatEther(totalUsdt));

    const contractUsdc = await contract.totalVaultBalances(BSC_USDC);
    const contractUsdt = await contract.totalVaultBalances(BSC_USDT);

    console.log("\nContract Internal Accounting:");
    console.log("totalVaultBalances(USDC):", ethers.formatEther(contractUsdc));
    console.log("totalVaultBalances(USDT):", ethers.formatEther(contractUsdt));

    if (totalUsdc === contractUsdc && totalUsdt === contractUsdt) {
        console.log("✅ SUCCESS: Found all missing funds mapped to their exact users!");
        console.log("We are ready to execute the extraction.");
    } else {
        console.log("⚠️ WARNING: Identified funds do not match contract total balances. We might need to scan further back in blocks.");
    }
}

scanVaultBalances().catch(console.error);
