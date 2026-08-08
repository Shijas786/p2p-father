import { ethers } from "ethers";
import { env } from "../src/config/env";
import { db } from "../src/db/client";

async function main() {
    console.log("=== Auditing Emergency Withdraw & User Mappings ===");

    const baseProvider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const bscProvider = new ethers.JsonRpcProvider(env.BSC_RPC_URL);

    const erc20Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)"
    ];

    const escrowAbi = [
        "function balances(address user, address token) view returns (uint256)",
        "event Deposit(address indexed user, address indexed token, uint256 amount)",
        "event Withdraw(address indexed user, address indexed token, uint256 amount)",
        "event TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, address token, uint256 amount, uint256 feeAmount, uint256 deadline)",
        "event TradeReleased(uint256 indexed tradeId, address indexed buyer, uint256 buyerReceives, uint256 feeAmount)"
    ];

    const baseEscrow = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, escrowAbi, baseProvider);
    const bscEscrow = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS_BSC, escrowAbi, bscProvider);

    const client = (db as any).getClient();

    // 1. Fetch ALL 901 users from DB
    const { data: users } = await client
        .from("users")
        .select("id, username, first_name, telegram_id, wallet_address")
        .not("wallet_address", "is", null);

    console.log(`Checking mappings for ${users?.length || 0} user wallets across Base and BSC...`);

    const baseUserVaults: { user: string; wallet: string; usdc: number; usdt: number }[] = [];
    const bscUserVaults: { user: string; wallet: string; usdt: number }[] = [];

    let totalBaseUsdcMapped = 0;
    let totalBaseUsdtMapped = 0;
    let totalBscUsdtMapped = 0;

    const chunkSize = 50;
    const userList = users || [];

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

                    if (usdcBase > 0 || usdtBase > 0) {
                        baseUserVaults.push({
                            user: `@${u.username || u.first_name || u.telegram_id}`,
                            wallet: u.wallet_address,
                            usdc: usdcBase,
                            usdt: usdtBase
                        });
                        totalBaseUsdcMapped += usdcBase;
                        totalBaseUsdtMapped += usdtBase;
                    }

                    if (usdtBsc > 0) {
                        bscUserVaults.push({
                            user: `@${u.username || u.first_name || u.telegram_id}`,
                            wallet: u.wallet_address,
                            usdt: usdtBsc
                        });
                        totalBscUsdtMapped += usdtBsc;
                    }
                } catch (e) {}
            })
        );
    }

    console.log("\n=================== BASE AUDIT ===================");
    const baseUsdcContract = new ethers.Contract(env.USDC_ADDRESS, erc20Abi, baseProvider);
    const baseUsdtContract = new ethers.Contract(env.USDT_ADDRESS, erc20Abi, baseProvider);

    const actualBaseUsdcBal = parseFloat(ethers.formatUnits(await baseUsdcContract.balanceOf(env.ESCROW_CONTRACT_ADDRESS), 6));
    const actualBaseUsdtBal = parseFloat(ethers.formatUnits(await baseUsdtContract.balanceOf(env.USDT_ADDRESS), 6));

    console.log(`Base Escrow Actual USDC Contract Balance: ${actualBaseUsdcBal} USDC`);
    console.log(`Base Escrow Total Mapped USDC to Users: ${totalBaseUsdcMapped} USDC`);
    console.log(`Base Escrow Actual USDT Contract Balance: ${actualBaseUsdtBal} USDT`);
    console.log(`Base Escrow Total Mapped USDT to Users: ${totalBaseUsdtMapped} USDT`);
    if (baseUserVaults.length > 0) {
        console.log("Users with Base Vault Mappings:", baseUserVaults);
    } else {
        console.log("No users have mapped balances on Base.");
    }

    console.log("\n=================== BSC AUDIT ===================");
    const bscUsdtContract = new ethers.Contract("0x55d398326f99059fF775485246999027B3197955", erc20Abi, bscProvider);
    const actualBscUsdtBal = parseFloat(ethers.formatUnits(await bscUsdtContract.balanceOf(env.ESCROW_CONTRACT_ADDRESS_BSC), 18));

    console.log(`BSC Escrow Actual USDT Contract Balance: ${actualBscUsdtBal} USDT`);
    console.log(`BSC Escrow Total Mapped USDT to Users: ${totalBscUsdtMapped} USDT`);
    if (bscUserVaults.length > 0) {
        console.log("Users with BSC Vault Mappings:", bscUserVaults);
    } else {
        console.log("No users have mapped balances on BSC.");
    }
}

main().catch(console.error);
