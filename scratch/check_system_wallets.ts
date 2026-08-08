import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const baseProvider = new ethers.JsonRpcProvider("https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER");
const bscProvider = new ethers.JsonRpcProvider("https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER");
const polyProvider = new ethers.JsonRpcProvider("https://polygon-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER");

const ERC20_ABI = [
    "function balanceOf(address account) view returns (uint256)"
];

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const POLY_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";

async function checkSystemWallets() {
    console.log("🔍 Checking System & Core Wallets...");

    // Relayer Wallet
    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    let relayerAddr = "";
    if (relayerKey) {
        relayerAddr = new ethers.Wallet(relayerKey).address;
    }

    // Master Wallet Seed (Index 0)
    const seed = process.env.MASTER_WALLET_SEED;
    let masterAddr = "";
    if (seed) {
        masterAddr = ethers.HDNodeWallet.fromMnemonic(ethers.Mnemonic.fromPhrase(seed)).address;
    }

    const adminAddr = process.env.ADMIN_WALLET_ADDRESS || "0x3A5668F8B3E167771d503F0321c42a7B082789Ef";

    const targets = [
        { name: "Relayer Wallet", address: relayerAddr },
        { name: "Master Seed Wallet (Index 0)", address: masterAddr },
        { name: "Admin Wallet", address: adminAddr },
        { name: "Base Escrow Contract", address: "0xf20872C359788a53958a048413D64F183403B1f1" },
        { name: "BSC Escrow Contract", address: "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a" }
    ];

    for (const t of targets) {
        if (!t.address) continue;
        console.log(`\n📌 ${t.name}: ${t.address}`);

        const [baseEth, bscBnb, polyMatic, baseUsdc, bscUsdt, polyUsdc] = await Promise.all([
            baseProvider.getBalance(t.address).catch(() => 0n),
            bscProvider.getBalance(t.address).catch(() => 0n),
            polyProvider.getBalance(t.address).catch(() => 0n),
            new ethers.Contract(BASE_USDC, ERC20_ABI, baseProvider).balanceOf(t.address).catch(() => 0n),
            new ethers.Contract(BSC_USDT, ERC20_ABI, bscProvider).balanceOf(t.address).catch(() => 0n),
            new ethers.Contract(POLY_USDC, ERC20_ABI, polyProvider).balanceOf(t.address).catch(() => 0n),
        ]);

        console.log(`  └ Base ETH:    ${ethers.formatEther(baseEth)} ETH`);
        console.log(`  └ BSC BNB:     ${ethers.formatEther(bscBnb)} BNB`);
        console.log(`  └ Polygon MATIC: ${ethers.formatEther(polyMatic)} MATIC`);
        console.log(`  └ Base USDC:   $${ethers.formatUnits(baseUsdc, 6)} USDC`);
        console.log(`  └ BSC USDT:    $${ethers.formatUnits(bscUsdt, 18)} USDT`);
        console.log(`  └ Polygon USDC: $${ethers.formatUnits(polyUsdc, 6)} USDC`);
    }
}

checkSystemWallets().catch(console.error);
