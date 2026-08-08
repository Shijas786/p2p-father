import { ethers } from "ethers";
import { env } from "../src/config/env";
import { db } from "../src/db/client";

async function main() {
    console.log("=== Querying Escrow Deposit & Balance Events ===");

    const baseProvider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const bscProvider = new ethers.JsonRpcProvider(env.BSC_RPC_URL);

    const abi = [
        "function balances(address user, address token) view returns (uint256)",
        "event Deposit(address indexed user, address indexed token, uint256 amount)",
        "event TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, address token, uint256 amount, uint256 feeAmount, uint256 deadline)"
    ];

    const baseEscrow = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, abi, baseProvider);
    const bscEscrow = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS_BSC, abi, bscProvider);

    const client = (db as any).getClient();

    // Query recent 100 deposits or users who interacted with the contract
    // We can also query all user addresses from DB in small batches
    const { data: users } = await client
        .from("users")
        .select("id, username, first_name, telegram_id, wallet_address")
        .not("wallet_address", "is", null);

    console.log(`Checking ${users?.length || 0} user wallets...`);

    const activeVaults: any[] = [];

    for (const u of (users || [])) {
        if (!u.wallet_address) continue;
        try {
            const usdtBaseRaw = await baseEscrow.balances(u.wallet_address, env.USDT_ADDRESS);
            const usdcBaseRaw = await baseEscrow.balances(u.wallet_address, env.USDC_ADDRESS);
            const usdtBscRaw = await bscEscrow.balances(u.wallet_address, "0x55d398326f99059fF775485246999027B3197955");

            const usdtBase = parseFloat(ethers.formatUnits(usdtBaseRaw, 6));
            const usdcBase = parseFloat(ethers.formatUnits(usdcBaseRaw, 6));
            const usdtBsc = parseFloat(ethers.formatUnits(usdtBscRaw, 18));

            if (usdtBase > 0 || usdcBase > 0 || usdtBsc > 0) {
                activeVaults.push({
                    user: `@${u.username || u.first_name || u.telegram_id}`,
                    telegram_id: u.telegram_id,
                    wallet: u.wallet_address,
                    base_usdt: usdtBase,
                    base_usdc: usdcBase,
                    bsc_usdt: usdtBsc
                });
            }
        } catch (e) {}
    }

    console.log(`\n🎉 Scan Finished! Found ${activeVaults.length} users holding vault balances:`);
    console.table(activeVaults);
}

main().catch(console.error);
