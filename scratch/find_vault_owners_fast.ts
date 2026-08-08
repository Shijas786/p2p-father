import { db } from "../src/db/client";
import { env } from "../src/config/env";
import { ethers } from "ethers";

async function main() {
    console.log("=== Fast Vault Owner Scan ===");
    const baseProvider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const bscProvider = new ethers.JsonRpcProvider(env.BSC_RPC_URL);

    const escrowAbi = [
        "function balances(address user, address token) view returns (uint256)"
    ];

    const baseEscrow = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, escrowAbi, baseProvider);
    const bscEscrow = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS_BSC, escrowAbi, bscProvider);

    const client = (db as any).getClient();
    const { data: users } = await client
        .from("users")
        .select("id, username, first_name, telegram_id, wallet_address")
        .not("wallet_address", "is", null);

    console.log(`Scanning ${users?.length || 0} users in parallel...`);

    const chunkSize = 30;
    const userList = users || [];

    for (let i = 0; i < userList.length; i += chunkSize) {
        const chunk = userList.slice(i, i + chunkSize);
        await Promise.all(
            chunk.map(async (u: any) => {
                if (!u.wallet_address) return;
                try {
                    const usdcRaw = await baseEscrow.balances(u.wallet_address, env.USDC_ADDRESS);
                    const usdtRaw = await baseEscrow.balances(u.wallet_address, env.USDT_ADDRESS);
                    const bscUsdtRaw = await bscEscrow.balances(u.wallet_address, "0x55d398326f99059fF775485246999027B3197955");

                    const usdc = parseFloat(ethers.formatUnits(usdcRaw, 6));
                    const usdt = parseFloat(ethers.formatUnits(usdtRaw, 6));
                    const bscUsdt = parseFloat(ethers.formatUnits(bscUsdtRaw, 18));

                    if (usdc > 0 || usdt > 0 || bscUsdt > 0) {
                        console.log(`\n🎯 FOUND USER WITH BALANCES:`);
                        console.log(`   User: @${u.username || u.first_name || u.telegram_id} (ID: ${u.id})`);
                        console.log(`   Telegram ID: ${u.telegram_id}`);
                        console.log(`   Wallet: ${u.wallet_address}`);
                        if (usdc > 0) console.log(`   ├ Base USDC Vault: ${usdc} USDC`);
                        if (usdt > 0) console.log(`   ├ Base USDT Vault: ${usdt} USDT`);
                        if (bscUsdt > 0) console.log(`   └ BSC USDT Vault: ${bscUsdt} USDT`);
                    }
                } catch (e: any) {
                    // skip errors
                }
            })
        );
    }
    console.log("\n=== Scan Complete ===");
}

main().catch(console.error);
