
import { ethers } from "ethers";
import { env } from "../src/config/env";

// Configuration
const RECOVERY_AMOUNT = "1.0"; // 1 USDC
const USER_ADDRESS = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";

// Start with hardcoded Base Mainnet addresses to be 100% sure
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ESCROW_ADDRESS = "0x78c2B85759C5F7d58fEea82D0Be098E540272245";

const ESCROW_ABI = [
    "function emergencyWithdraw(address _token, uint256 _amount) external"
];

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)"
];

async function main() {
    console.log("--- FUND REFUND SCRIPT (Step 2 Only) ---");

    if (!env.RELAYER_PRIVATE_KEY) {
        throw new Error("Missing RELAYER_PRIVATE_KEY");
    }

    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const wallet = new ethers.Wallet(env.RELAYER_PRIVATE_KEY, provider);

    console.log(`Relayer: ${wallet.address}`);

    const usdc = new ethers.Contract(USDC_BASE, ERC20_ABI, wallet);

    // 2. REFUND USER
    const decimals = 6;
    const amountUnits = ethers.parseUnits(RECOVERY_AMOUNT, decimals);

    console.log(`\nRefunding User ${USER_ADDRESS}...`);

    // Check Relayer Balance
    const relayerUsdc = await usdc.balanceOf(wallet.address);
    console.log(`   Relayer USDC Balance: ${ethers.formatUnits(relayerUsdc, 6)}`);

    if (relayerUsdc < amountUnits) {
        console.error(`   ❌ Relayer has insufficient USDC to refund.`);
        // Don't return, try anyway? No, it will revert.
        return;
    }

    try {
        const tx = await usdc.transfer(USER_ADDRESS, amountUnits);
        console.log(`   Tx Sent: ${tx.hash}`);
        await tx.wait();
        console.log("   ✅ Refund Successful");
    } catch (err: any) {
        console.error("   ❌ Refund Failed:", err.message);
    }
}

main();
