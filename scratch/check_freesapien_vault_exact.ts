import { db } from "../src/db/client";
import { escrow } from "../src/services/escrow";
import { env } from "../src/config/env";
import { ethers } from "ethers";

async function main() {
    const walletAddress = "0x6540Bb882aE5b710C5a0efd9F76dada30ac7F9cF";
    console.log("=== Checking Exact Balances for Wallet:", walletAddress, "===");

    const baseProvider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const bscProvider = new ethers.JsonRpcProvider(env.BSC_RPC_URL);

    const escrowAbi = [
        "function balances(address user, address token) view returns (uint256)",
        "event Deposit(address indexed user, address indexed token, uint256 amount)",
        "event Withdraw(address indexed user, address indexed token, uint256 amount)"
    ];

    const baseContract = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, escrowAbi, baseProvider);
    const bscContract = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS_BSC, escrowAbi, bscProvider);

    // 1. Base Balances
    const baseUsdcVault = await baseContract.balances(walletAddress, env.USDC_ADDRESS);
    const baseUsdtVault = await baseContract.balances(walletAddress, env.USDT_ADDRESS);

    console.log("BASE Escrow Contract:", env.ESCROW_CONTRACT_ADDRESS);
    console.log("Base Vault USDC:", ethers.formatUnits(baseUsdcVault, 6));
    console.log("Base Vault USDT:", ethers.formatUnits(baseUsdtVault, 6));

    // 2. BSC Balances
    const bscUsdtAddr = "0x55d398326f99059fF775485246999027B3197955";
    const bscBnbAddr = "0x0000000000000000000000000000000000000000";
    const bscUsdtVault = await bscContract.balances(walletAddress, bscUsdtAddr);
    const bscBnbVault = await bscContract.balances(walletAddress, bscBnbAddr);

    console.log("\nBSC Escrow Contract:", env.ESCROW_CONTRACT_ADDRESS_BSC);
    console.log("BSC Vault USDT:", ethers.formatUnits(bscUsdtVault, 18));
    console.log("BSC Vault BNB:", ethers.formatUnits(bscBnbVault, 18));

    // 3. Query all users matching freesapien in DB
    const client = (db as any).getClient();
    const { data: users } = await client
        .from("users")
        .select("*")
        .ilike("username", "%freesapien%");
    console.log("\nDB Users found:", users);

    // 4. Query Deposit Events on Base for this wallet
    console.log("\nQuerying Deposit Events on Base Escrow...");
    try {
        const filterDeposit = baseContract.filters.Deposit(walletAddress, null);
        const latestBlock = await baseProvider.getBlockNumber();
        // search last 10,000 blocks (~5 hours)
        const deposits = await baseContract.queryFilter(filterDeposit, Math.max(0, latestBlock - 20000), latestBlock);
        console.log(`Found ${deposits.length} deposits on Base in last 20k blocks.`);
        for (const dep of deposits) {
            const parsed = dep as any;
            console.log(`  Deposit Tx: ${dep.transactionHash} | Token: ${parsed.args[1]} | Amount: ${parsed.args[2].toString()}`);
        }
    } catch (e: any) {
        console.error("Deposit query error:", e.message);
    }
}

main().catch(console.error);
