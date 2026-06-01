import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();

const RELAYER_KEY = process.env.RELAYER_PRIVATE_KEY;
const BASE_RPC_URL = process.env.BASE_RPC_URL;
const BSC_RPC_URL = process.env.BSC_RPC_URL;

const BASE_USDC = process.env.USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_USDT = process.env.USDT_ADDRESS || "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";

const BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_BNB = "0x0000000000000000000000000000000000000000";

const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address) view returns (uint256)"
];

async function refundBalances() {
    // Check if running in real execution mode
    const isDryRun = process.argv.includes("--execute") ? false : true;
    
    if (isDryRun) {
        console.log("==================================================");
        console.log("DRY RUN MODE. No real transactions will be sent.");
        console.log("To execute real transactions, run with: --execute");
        console.log("==================================================");
    } else {
        console.log("==================================================");
        console.log("🚨 WARNING: RUNNING IN EXECUTION MODE! Real funds will be transferred.");
        console.log("==================================================");
    }

    if (!RELAYER_KEY) {
        console.error("Missing RELAYER_PRIVATE_KEY in .env");
        process.exit(1);
    }

    const dataPath = path.join(__dirname, "vault_migration_data.json");
    if (!fs.existsSync(dataPath)) {
        console.error("Missing vault_migration_data.json. Run check_active_users_vault.ts first.");
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    console.log(`Loaded ${data.length} users for refund.`);

    const baseProvider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    const bscProvider = new ethers.JsonRpcProvider(BSC_RPC_URL);

    const baseWallet = new ethers.Wallet(RELAYER_KEY, baseProvider);
    const bscWallet = new ethers.Wallet(RELAYER_KEY, bscProvider);

    console.log(`Admin Wallet Address: ${baseWallet.address}`);

    const baseUsdcContract = new ethers.Contract(BASE_USDC, ERC20_ABI, baseWallet);
    const baseUsdtContract = new ethers.Contract(BASE_USDT, ERC20_ABI, baseWallet);
    const bscUsdcContract = new ethers.Contract(BSC_USDC, ERC20_ABI, bscWallet);
    const bscUsdtContract = new ethers.Contract(BSC_USDT, ERC20_ABI, bscWallet);

    for (const user of data) {
        console.log(`\n--------------------------------------------------`);
        console.log(`Refunding user: @${user.username} (${user.first_name})`);
        console.log(`To Wallet: ${user.wallet_address}`);

        for (const bal of user.balances) {
            const amount = bal.amount;
            const token = bal.token;
            const chain = bal.chain;

            console.log(`- Amount: ${amount} ${token} on ${chain}`);

            if (chain === "Base") {
                const contract = token === "USDC" ? baseUsdcContract : baseUsdtContract;
                const decimals = 6;
                const parsedAmount = ethers.parseUnits(amount, decimals);

                if (isDryRun) {
                    console.log(`  [DRY RUN] Would transfer ${amount} ${token} to ${user.wallet_address} on Base`);
                } else {
                    try {
                        console.log(`  Sending Base transaction...`);
                        const tx = await contract.transfer(user.wallet_address, parsedAmount);
                        console.log(`  Tx Sent! Hash: ${tx.hash}`);
                        console.log(`  Waiting for confirmation...`);
                        await tx.wait();
                        console.log(`  ✅ Confirmed!`);
                    } catch (err: any) {
                        console.error(`  ❌ Failed: ${err.message}`);
                    }
                }
            } else if (chain === "BSC") {
                const decimals = 18; // BSC USDC, USDT, BNB are all 18 decimals
                const parsedAmount = ethers.parseUnits(amount, decimals);

                if (token === "BNB") {
                    if (isDryRun) {
                        console.log(`  [DRY RUN] Would transfer ${amount} BNB to ${user.wallet_address} on BSC`);
                    } else {
                        try {
                            console.log(`  Sending BSC BNB transaction...`);
                            const txOptions: any = {};
                            txOptions.gasPrice = ethers.parseUnits("0.1", "gwei"); // 0.1 gwei as per config
                            
                            const tx = await bscWallet.sendTransaction({
                                to: user.wallet_address,
                                value: parsedAmount,
                                ...txOptions
                            });
                            console.log(`  Tx Sent! Hash: ${tx.hash}`);
                            console.log(`  Waiting for confirmation...`);
                            await tx.wait();
                            console.log(`  ✅ Confirmed!`);
                        } catch (err: any) {
                            console.error(`  ❌ Failed: ${err.message}`);
                        }
                    }
                } else {
                    const contract = token === "USDC" ? bscUsdcContract : bscUsdtContract;
                    if (isDryRun) {
                        console.log(`  [DRY RUN] Would transfer ${amount} ${token} to ${user.wallet_address} on BSC`);
                    } else {
                        try {
                            console.log(`  Sending BSC token transaction...`);
                            const txOptions: any = {};
                            txOptions.gasPrice = ethers.parseUnits("0.1", "gwei"); // 0.1 gwei as per config

                            const tx = await contract.transfer(user.wallet_address, parsedAmount, txOptions);
                            console.log(`  Tx Sent! Hash: ${tx.hash}`);
                            console.log(`  Waiting for confirmation...`);
                            await tx.wait();
                            console.log(`  ✅ Confirmed!`);
                        } catch (err: any) {
                            console.error(`  ❌ Failed: ${err.message}`);
                        }
                    }
                }
            }
        }
    }

    console.log(`\n==================================================`);
    console.log(`Finished ${isDryRun ? "Dry Run" : "Execution"}`);
    console.log(`==================================================`);
}

refundBalances().catch(console.error);
