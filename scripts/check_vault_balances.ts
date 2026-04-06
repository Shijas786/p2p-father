import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const ESCROW_ABI = [
    "event Deposit(address indexed user, address indexed token, uint256 amount)",
    "event Withdraw(address indexed user, address indexed token, uint256 amount)",
    "event TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, address token, uint256 amount, uint256 feeAmount, uint256 deadline)",
    "function balances(address user, address token) view returns (uint256)",
    "function trades(uint256 tradeId) view returns (tuple(address seller, address buyer, address token, uint256 amount, uint256 feeAmount, uint256 buyerReceives, uint8 status, uint256 createdAt, uint256 deadline, uint256 fiatSentAt, address disputeInitiator, string disputeReason))"
];

const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

async function main() {
    const rpcUrl = process.env.BSC_RPC_URL;
    const contractAddress = process.env.ESCROW_CONTRACT_ADDRESS_BSC;

    if (!rpcUrl || !contractAddress) {
        console.error("Missing BSC_RPC_URL or ESCROW_CONTRACT_ADDRESS_BSC in .env");
        return;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(contractAddress, ESCROW_ABI, provider);

    console.log("Checking BSC Escrow:", contractAddress);

    // 1. Get all users who deposited
    const depositFilter = contract.filters.Deposit(null, USDT_BSC);
    const depositLogs = await contract.queryFilter(depositFilter, 0, "latest");
    const users = new Set<string>();
    depositLogs.forEach((log: any) => users.add(log.args[0]));

    console.log(`Found ${users.size} unique users who deposited USDT.`);

    // 2. Check current balance for each user
    let totalVault = 0n;
    for (const user of users) {
        const bal = await contract.balances(user, USDT_BSC);
        if (bal > 0n) {
            console.log(`User ${user} has vault balance: ${ethers.formatUnits(bal, 18)} USDT`);
            totalVault += bal;
        }
    }

    console.log(`\nTotal Vault Balance: ${ethers.formatUnits(totalVault, 18)} USDT`);

    // 3. Check contract's raw balance (already know it was 17.6)
    // Actually, I already emergencyWithdrawed it, so it's 0 now.
}

main().catch(console.error);
