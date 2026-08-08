import { db } from "../src/db/client";
import { env } from "../src/config/env";
import { ethers } from "ethers";

async function main() {
    console.log("=== Checking All Contract & Vault Balances ===");

    const baseProvider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const bscProvider = new ethers.JsonRpcProvider(env.BSC_RPC_URL);

    const erc20Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)"
    ];

    const escrowAbi = [
        "function balances(address user, address token) view returns (uint256)"
    ];

    // 1. Total Token Balances inside Escrow Smart Contracts
    const baseUsdcContract = new ethers.Contract(env.USDC_ADDRESS, erc20Abi, baseProvider);
    const baseUsdtContract = new ethers.Contract(env.USDT_ADDRESS, erc20Abi, baseProvider);

    const baseEscrowUsdcBal = await baseUsdcContract.balanceOf(env.ESCROW_CONTRACT_ADDRESS);
    const baseEscrowUsdtBal = await baseUsdtContract.balanceOf(env.USDT_ADDRESS);

    console.log(`Base Escrow Contract (${env.ESCROW_CONTRACT_ADDRESS}):`);
    console.log(`  USDC Contract Balance: ${ethers.formatUnits(baseEscrowUsdcBal, 6)} USDC`);
    console.log(`  USDT Contract Balance: ${ethers.formatUnits(baseEscrowUsdtBal, 6)} USDT`);

    const bscUsdtContract = new ethers.Contract("0x55d398326f99059fF775485246999027B3197955", erc20Abi, bscProvider);
    const bscEscrowUsdtBal = await bscUsdtContract.balanceOf(env.ESCROW_CONTRACT_ADDRESS_BSC);

    console.log(`\nBSC Escrow Contract (${env.ESCROW_CONTRACT_ADDRESS_BSC}):`);
    console.log(`  USDT Contract Balance: ${ethers.formatUnits(bscEscrowUsdtBal, 18)} USDT`);

    // 2. Fetch all registered users in DB and check their vault balances on-chain
    const client = (db as any).getClient();
    const { data: users } = await client
        .from("users")
        .select("id, username, first_name, telegram_id, wallet_address")
        .not("wallet_address", "is", null);

    console.log(`\nChecking vault balances for ${users?.length || 0} registered users on Base...`);

    const baseEscrowContract = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, escrowAbi, baseProvider);
    const bscEscrowContract = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS_BSC, escrowAbi, bscProvider);

    let baseTotalVaultUsdc = 0;
    let bscTotalVaultUsdt = 0;

    for (const u of (users || [])) {
        if (!u.wallet_address) continue;

        try {
            const usdcVault = await baseEscrowContract.balances(u.wallet_address, env.USDC_ADDRESS);
            const usdcMins = parseFloat(ethers.formatUnits(usdcVault, 6));

            const usdtVault = await baseEscrowContract.balances(u.wallet_address, env.USDT_ADDRESS);
            const usdtMins = parseFloat(ethers.formatUnits(usdtVault, 6));

            const bscUsdtVault = await bscEscrowContract.balances(u.wallet_address, "0x55d398326f99059fF775485246999027B3197955");
            const bscUsdtMins = parseFloat(ethers.formatUnits(bscUsdtVault, 18));

            if (usdcMins > 0 || usdtMins > 0 || bscUsdtMins > 0) {
                console.log(`👤 User @${u.username || u.first_name || u.telegram_id} (${u.wallet_address}):`);
                if (usdcMins > 0) console.log(`   └ Base Vault USDC: ${usdcMins} USDC`);
                if (usdtMins > 0) console.log(`   └ Base Vault USDT: ${usdtMins} USDT`);
                if (bscUsdtMins > 0) console.log(`   └ BSC Vault USDT: ${bscUsdtMins} USDT`);
                baseTotalVaultUsdc += usdcMins;
                bscTotalVaultUsdt += bscUsdtMins;
            }
        } catch (e: any) {
            // ignore individual read errors
        }
    }

    console.log("\n=================== SUMMARY ===================");
    console.log(`Total Base Escrow Vault USDC allocated to users: ${baseTotalVaultUsdc} USDC`);
    console.log(`Total BSC Escrow Vault USDT allocated to users: ${bscTotalVaultUsdt} USDT`);
}

main().catch(console.error);
