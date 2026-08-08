import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

// Standard public RPCs
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

async function checkWallet(name: string, address: string) {
    if (!address) return;
    try {
        const [baseEth, bscBnb, baseUsdc, bscUsdt, baseVault, bscVault] = await Promise.all([
            baseProvider.getBalance(address).catch(() => 0n),
            bscProvider.getBalance(address).catch(() => 0n),
            baseUsdcContract.balanceOf(address).catch(() => 0n),
            bscUsdtContract.balanceOf(address).catch(() => 0n),
            baseEscrowContract.balances(address, BASE_USDC).catch(() => 0n),
            bscEscrowContract.balances(address, BSC_USDT).catch(() => 0n),
        ]);

        const ethVal = parseFloat(ethers.formatEther(baseEth));
        const bnbVal = parseFloat(ethers.formatEther(bscBnb));
        const usdcVal = parseFloat(ethers.formatUnits(baseUsdc, 6));
        const usdtVal = parseFloat(ethers.formatUnits(bscUsdt, 18));
        const baseVaultVal = parseFloat(ethers.formatUnits(baseVault, 6));
        const bscVaultVal = parseFloat(ethers.formatUnits(bscVault, 18));

        console.log(`📌 ${name} (${address})`);
        console.log(`   ├─ Base ETH:    ${ethVal.toFixed(6)} ETH`);
        console.log(`   ├─ BSC BNB:     ${bnbVal.toFixed(6)} BNB`);
        console.log(`   ├─ Base USDC:   $${usdcVal.toFixed(2)} USDC`);
        console.log(`   ├─ BSC USDT:    $${usdtVal.toFixed(2)} USDT`);
        console.log(`   ├─ Base Vault:  $${baseVaultVal.toFixed(2)} USDC`);
        console.log(`   └─ BSC Vault:   $${bscVaultVal.toFixed(2)} USDT\n`);
    } catch (e: any) {
        console.error(`Error checking ${name}:`, e.message);
    }
}

async function main() {
    console.log("==================================================");
    console.log("         🔍 INSTANT BOT WALLET CHECK");
    console.log("==================================================\n");

    // 1. Relayer / Admin Wallet
    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    let relayerAddr = "0x3A5668F8B3E167771d503F0321c42a7B082789Ef";
    if (relayerKey) {
        try { relayerAddr = new ethers.Wallet(relayerKey).address; } catch {}
    }
    await checkWallet("Relayer / Admin Wallet", relayerAddr);

    // 2. Master Wallet Seed (Index 0 & 1)
    const seed = process.env.MASTER_WALLET_SEED;
    if (seed) {
        try {
            const hd = ethers.HDNodeWallet.fromMnemonic(ethers.Mnemonic.fromPhrase(seed));
            await checkWallet("Master Bot Seed Wallet (Index 0)", hd.address);
            const w1 = hd.derivePath("m/44'/60'/0'/0/1");
            await checkWallet("Master Bot Seed Wallet (Index 1)", w1.address);
        } catch (e: any) {
            console.error("HD derivation error:", e.message);
        }
    }

    // 3. Known specific bot addresses from codebase
    await checkWallet("Bot Address 1", "0x774Ef3cf5dC7522D833D59Bf0a4FF9024417cA70");
    await checkWallet("Bot Address 2", "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799");

    // 4. Escrow Contracts total holdings
    await checkWallet("Base Escrow Contract Total", BASE_ESCROW);
    await checkWallet("BSC Escrow Contract Total", BSC_ESCROW);

    console.log("==================================================");
}

main().catch(console.error);
