import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

const baseProvider = new ethers.JsonRpcProvider("https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER");
const bscProvider = new ethers.JsonRpcProvider("https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER");

const ESCROW_ABI = [
    "function balances(address user, address token) view returns (uint256)"
];
const ERC20_ABI = [
    "function balanceOf(address account) view returns (uint256)"
];

const BASE_ESCROW = "0xf20872C359788a53958a048413D64F183403B1f1";
const BSC_ESCROW = "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

async function checkAllUserBalances() {
    console.log("🔍 Checking all users with non-zero balances on-chain...");

    const { data: users, error } = await supabase
        .from("users")
        .select("id, telegram_id, username, first_name, wallet_address")
        .not("wallet_address", "is", null);

    if (error || !users) {
        console.error("Error fetching users:", error);
        return;
    }

    console.log(`Checking ${users.length} users with wallets...`);

    const baseEscrowContract = new ethers.Contract(BASE_ESCROW, ESCROW_ABI, baseProvider);
    const bscEscrowContract = new ethers.Contract(BSC_ESCROW, ESCROW_ABI, bscProvider);

    const baseUsdcContract = new ethers.Contract(BASE_USDC, ERC20_ABI, baseProvider);
    const bscUsdtContract = new ethers.Contract(BSC_USDT, ERC20_ABI, bscProvider);

    const fundedUsers: any[] = [];

    // Check in parallel batches of 20
    const batchSize = 20;
    for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        await Promise.all(
            batch.map(async (u) => {
                try {
                    const [baseEth, bscBnb, baseUsdc, bscUsdt, baseVault, bscVault] = await Promise.all([
                        baseProvider.getBalance(u.wallet_address),
                        bscProvider.getBalance(u.wallet_address),
                        baseUsdcContract.balanceOf(u.wallet_address).catch(() => 0n),
                        bscUsdtContract.balanceOf(u.wallet_address).catch(() => 0n),
                        baseEscrowContract.balances(u.wallet_address, BASE_USDC).catch(() => 0n),
                        bscEscrowContract.balances(u.wallet_address, BSC_USDT).catch(() => 0n),
                    ]);

                    const ethVal = parseFloat(ethers.formatEther(baseEth));
                    const bnbVal = parseFloat(ethers.formatEther(bscBnb));
                    const usdcVal = parseFloat(ethers.formatUnits(baseUsdc, 6));
                    const usdtVal = parseFloat(ethers.formatUnits(bscUsdt, 18));
                    const baseVaultVal = parseFloat(ethers.formatUnits(baseVault, 6));
                    const bscVaultVal = parseFloat(ethers.formatUnits(bscVault, 18));

                    if (ethVal > 0.0001 || bnbVal > 0.0001 || usdcVal > 0.1 || usdtVal > 0.1 || baseVaultVal > 0.1 || bscVaultVal > 0.1) {
                        fundedUsers.push({
                            username: u.username || u.first_name || u.telegram_id,
                            telegram_id: u.telegram_id,
                            wallet: u.wallet_address,
                            baseEth: ethVal.toFixed(5),
                            bscBnb: bnbVal.toFixed(5),
                            baseUsdc: usdcVal.toFixed(2),
                            bscUsdt: usdtVal.toFixed(2),
                            baseEscrowVault: baseVaultVal.toFixed(2),
                            bscEscrowVault: bscVaultVal.toFixed(2)
                        });
                    }
                } catch (err) {
                    // ignore individual wallet check errors
                }
            })
        );
    }

    console.log(`\n💰 Found ${fundedUsers.length} wallets with funds:`);
    console.table(fundedUsers);
}

checkAllUserBalances().catch(console.error);
