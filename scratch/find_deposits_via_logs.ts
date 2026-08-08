import { ethers } from "ethers";
import { env } from "../src/config/env";
import { db } from "../src/db/client";

async function main() {
    console.log("=== Checking Active Traders in DB ===");

    const baseProvider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const bscProvider = new ethers.JsonRpcProvider(env.BSC_RPC_URL);

    const abi = ["function balances(address user, address token) view returns (uint256)"];

    const baseEscrow = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, abi, baseProvider);
    const bscEscrow = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS_BSC, abi, bscProvider);

    const client = (db as any).getClient();

    // Query top users ordered by completed_trades or recent trade activity
    const { data: activeUsers } = await client
        .from("users")
        .select("id, username, first_name, telegram_id, wallet_address, completed_trades, total_volume")
        .order("completed_trades", { ascending: false })
        .limit(100);

    console.log(`Checking top ${activeUsers?.length || 0} active traders...`);

    const activeHolders: any[] = [];

    for (const u of (activeUsers || [])) {
        if (!u.wallet_address) continue;
        try {
            const [usdcBaseRaw, usdtBaseRaw, usdtBscRaw] = await Promise.all([
                baseEscrow.balances(u.wallet_address, env.USDC_ADDRESS).catch(() => 0n),
                baseEscrow.balances(u.wallet_address, env.USDT_ADDRESS).catch(() => 0n),
                bscEscrow.balances(u.wallet_address, "0x55d398326f99059fF775485246999027B3197955").catch(() => 0n)
            ]);

            const usdcBase = parseFloat(ethers.formatUnits(usdcBaseRaw, 6));
            const usdtBase = parseFloat(ethers.formatUnits(usdtBaseRaw, 6));
            const usdtBsc = parseFloat(ethers.formatUnits(usdtBscRaw, 18));

            if (usdcBase > 0 || usdtBase > 0 || usdtBsc > 0) {
                activeHolders.push({
                    username: `@${u.username || u.first_name || u.telegram_id}`,
                    telegram_id: u.telegram_id,
                    wallet: u.wallet_address,
                    completed_trades: u.completed_trades,
                    base_usdc: usdcBase,
                    base_usdt: usdtBase,
                    bsc_usdt: usdtBsc
                });
            }
        } catch (e) {}
    }

    console.log(`\nFound ${activeHolders.length} top traders holding vault balances:`);
    console.table(activeHolders);
}

main().catch(console.error);
