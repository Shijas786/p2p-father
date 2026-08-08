import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

const baseProvider = new ethers.JsonRpcProvider("https://mainnet.base.org");
const bscProvider = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org");

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
const ESCROW_ABI = ["function balances(address user, address token) view returns (uint256)"];

const BASE_ESCROW = "0xf20872C359788a53958a048413D64F183403B1f1";
const BSC_ESCROW = "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

const baseEscrowContract = new ethers.Contract(BASE_ESCROW, ESCROW_ABI, baseProvider);
const bscEscrowContract = new ethers.Contract(BSC_ESCROW, ESCROW_ABI, bscProvider);
const baseUsdcContract = new ethers.Contract(BASE_USDC, ERC20_ABI, baseProvider);
const bscUsdtContract = new ethers.Contract(BSC_USDT, ERC20_ABI, bscProvider);

async function findOrusmon() {
    console.log("🔍 Searching specifically for user 'orusmon' / 'orus'...");

    const { data: users, error } = await supabase.from("users").select("*");

    if (error || !users) {
        console.error("Error:", error);
        return;
    }

    const matches = users.filter((u: any) => {
        const text = `${u.username || ''} ${u.first_name || ''} ${u.last_name || ''} ${u.telegram_id || ''}`.toLowerCase();
        return text.includes("orus") || text.includes("usmon") || text.includes("osmon") || text.includes("orusmon") || text.includes("osman");
    });

    console.log(`Matched ${matches.length} user(s):`);

    for (const u of matches) {
        console.log(`\n👤 User found: @${u.username || u.first_name} (ID: ${u.telegram_id})`);
        console.log(`   Wallet: ${u.wallet_address}`);

        if (u.wallet_address) {
            const [baseEth, bscBnb, baseUsdc, bscUsdt, baseVault, bscVault] = await Promise.all([
                baseProvider.getBalance(u.wallet_address).catch(() => 0n),
                bscProvider.getBalance(u.wallet_address).catch(() => 0n),
                baseUsdcContract.balanceOf(u.wallet_address).catch(() => 0n),
                bscUsdtContract.balanceOf(u.wallet_address).catch(() => 0n),
                baseEscrowContract.balances(u.wallet_address, BASE_USDC).catch(() => 0n),
                bscEscrowContract.balances(u.wallet_address, BSC_USDT).catch(() => 0n),
            ]);

            console.log(`   ├─ Base ETH:    ${ethers.formatEther(baseEth)} ETH`);
            console.log(`   ├─ BSC BNB:     ${ethers.formatEther(bscBnb)} BNB`);
            console.log(`   ├─ Base USDC:   $${ethers.formatUnits(baseUsdc, 6)} USDC`);
            console.log(`   ├─ BSC USDT:    $${ethers.formatUnits(bscUsdt, 18)} USDT`);
            console.log(`   ├─ Base Vault:  $${ethers.formatUnits(baseVault, 6)} USDC`);
            console.log(`   └─ BSC Vault:   $${ethers.formatUnits(bscVault, 18)} USDT`);
        }
    }

    if (matches.length === 0) {
        console.log("No exact match for 'orusmon'. Listing fuzzy matches for usernames starting with 'o' or containing 'mon':");
        const fuzzy = users.filter((u: any) => {
            const text = `${u.username || ''} ${u.first_name || ''}`.toLowerCase();
            return text.includes("mon") || text.includes("usm") || text.includes("orus") || text.includes("osm");
        });
        console.log(fuzzy.map((u: any) => ({ username: u.username, first_name: u.first_name, telegram_id: u.telegram_id, wallet: u.wallet_address })));
    }
}

findOrusmon().catch(console.error);
