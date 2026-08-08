import { ethers } from "ethers";
import { env } from "../src/config/env";

const walletAddress = "0x6540Bb882aE5b710C5a0efd9F76dada30ac7F9cF";

async function main() {
    console.log("=== Tracing All Escrow Events for User ===");
    console.log("User Wallet:", walletAddress);
    console.log("Escrow Contract:", env.ESCROW_CONTRACT_ADDRESS);

    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const abi = [
        "function balances(address user, address token) view returns (uint256)",
        "event Deposit(address indexed user, address indexed token, uint256 amount)",
        "event Withdraw(address indexed user, address indexed token, uint256 amount)",
        "event TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, address token, uint256 amount, uint256 feeAmount, uint256 deadline)",
        "event TradeReleased(uint256 indexed tradeId, address indexed buyer, uint256 buyerReceives, uint256 feeAmount)"
    ];

    const contract = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, abi, provider);

    const currentBlock = await provider.getBlockNumber();
    console.log(`Current Base Block: ${currentBlock}`);

    // Query in small chunks of 2000 blocks around July 25-26 (approx block ~17500000 to ~18000000 or search backwards)
    // Let's find block for July 25, 2026:
    // Base block time is ~2 seconds. 1 day = 43,200 blocks.
    // Today is Aug 2. July 25 is ~8 days ago = ~345,600 blocks ago.

    const targetBlockApprox = currentBlock - 345600;

    // Scan ranges of 2000 blocks around targetBlockApprox
    for (let b = targetBlockApprox - 50000; b <= currentBlock; b += 2000) {
        const toB = Math.min(b + 1999, currentBlock);
        try {
            const filterDep = contract.filters.Deposit(walletAddress);
            const deposits = await contract.queryFilter(filterDep, b, toB);

            const filterWith = contract.filters.Withdraw(walletAddress);
            const withdraws = await contract.queryFilter(filterWith, b, toB);

            const filterCreated = contract.filters.TradeCreated(null, walletAddress);
            const created = await contract.queryFilter(filterCreated, b, toB);

            if (deposits.length > 0 || withdraws.length > 0 || created.length > 0) {
                console.log(`\nBlock range [${b} - ${toB}]:`);
                for (const d of deposits) {
                    const p = d as any;
                    console.log(`  ➕ DEPOSIT: ${ethers.formatUnits(p.args[2], 6)} USDC | Tx: ${d.transactionHash}`);
                }
                for (const w of withdraws) {
                    const p = w as any;
                    console.log(`  ➖ WITHDRAW: ${ethers.formatUnits(p.args[2], 6)} USDC | Tx: ${w.transactionHash}`);
                }
                for (const c of created) {
                    const p = c as any;
                    console.log(`  🔒 TRADE CREATED #${p.args[0]}: ${ethers.formatUnits(p.args[4], 6)} USDC | Buyer: ${p.args[2]} | Tx: ${c.transactionHash}`);
                }
            }
        } catch (e: any) {
            // chunk failed, skip
        }
    }

    const finalBal = await contract.balances(walletAddress, env.USDC_ADDRESS);
    console.log("\nFinal Contract balances(user, USDC):", ethers.formatUnits(finalBal, 6));
}

main().catch(console.error);
