import { ethers } from "ethers";
import { env } from "../src/config/env";
import { db } from "../src/db/client";

async function main() {
    console.log("=== Fast Parallel Scan for Escrow Vault Owners ===");

    const baseProvider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const bscProvider = new ethers.JsonRpcProvider(env.BSC_RPC_URL);

    const abi = ["function balances(address user, address token) view returns (uint256)"];

    const baseEscrow = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, abi, baseProvider);
    const bscEscrow = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS_BSC, abi, bscProvider);

    const client = (db as any).getClient();
    const { data: users } = await client
        .from("users")
        .select("id, username, first_name, telegram_id, wallet_address")
        .not("wallet_address", "is", null);

    const userList = users || [];
    console.log(`Checking ${userList.length} wallets...`);

    const activeHolders: any[] = [];
    const chunkSize = 50;

    for (let i = 0; i < userList.length; i += chunkSize) {
        const chunk = userList.slice(i, i + chunkSize);
        await Promise.all(
            chunk.map(async (u: any) => {
                if (!u.wallet_address) return;
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
                            base_usdc: usdcBase,
                            base_usdt: usdtBase,
                            bsc_usdt: usdtBsc
                        });
                    }
                } catch (e) {}
            })
        );
    }

    console.log("\n=================== AUDIT RESULTS ===================");
    console.log(`Found ${activeHolders.length} active vault balance holders:`);
    console.table(activeHolders);
}

main().catch(console.error);
