import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = process.env.BSC_RPC_URL || "https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER";
const ESCROW_BSC = "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

const ESCROW_ABI = [
    "event Deposit(address indexed user, address indexed token, uint256 amount)",
    "function balances(address user, address token) view returns (uint256)",
    "function emergencyWithdraw(address token, uint256 amount) external",
    "function owner() view returns (address)"
];

async function main() {
    console.log("🔍 Scanning Deposit events on BSC Contract 0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a...");
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const contract = new ethers.Contract(ESCROW_BSC, ESCROW_ABI, provider);

    const currentBlock = await provider.getBlockNumber();
    const startBlock = currentBlock - 200000; // ~7 days

    const depositFilter = contract.filters.Deposit();
    const deposits = await contract.queryFilter(depositFilter, startBlock, currentBlock);

    const users = new Set<string>();
    deposits.forEach((event: any) => {
        users.add(event.args.user);
    });

    console.log(`Found ${users.size} unique deposit users.`);

    let foundUsersWithVault: { user: string, balance: string }[] = [];

    for (const user of Array.from(users)) {
        const bal = await contract.balances(user, BSC_USDT);
        if (bal > 0n) {
            foundUsersWithVault.push({
                user,
                balance: ethers.formatUnits(bal, 18)
            });
        }
    }

    console.log("\nUsers with non-zero vault balances on BSC:");
    console.table(foundUsersWithVault);
}

main().catch(console.error);
