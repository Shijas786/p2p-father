import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER";
const ESCROW_BASE = "0xf20872C359788a53958a048413D64F183403B1f1";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_USDT = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)"
];

async function main() {
    console.log("==================================================");
    console.log("🔄 Reverting Base Contract Transfers");
    console.log("==================================================");

    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKey) {
        throw new Error("RELAYER_PRIVATE_KEY is missing from environment.");
    }

    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    const relayerWallet = new ethers.Wallet(relayerKey, provider);

    console.log(`Relayer Address: ${relayerWallet.address}`);
    console.log(`Escrow Contract: ${ESCROW_BASE}\n`);

    // 1. Revert USDC (10.020323 USDC = 10020323 units)
    const usdc = new ethers.Contract(BASE_USDC, ERC20_ABI, relayerWallet);
    const usdcBal = await usdc.balanceOf(relayerWallet.address);
    console.log(`Relayer Base USDC Balance: ${ethers.formatUnits(usdcBal, 6)} USDC`);

    const usdcToRevert = 10020323n; // exact amount withdrawn earlier
    if (usdcBal >= usdcToRevert) {
        console.log(`Transferring back ${ethers.formatUnits(usdcToRevert, 6)} USDC to ${ESCROW_BASE}...`);
        const tx1 = await usdc.transfer(ESCROW_BASE, usdcToRevert);
        console.log(`Tx submitted: ${tx1.hash}`);
        await tx1.wait();
        console.log(`✅ USDC returned to Base Contract!`);
    } else {
        console.log(`⚠️ Balance lower than 10.020323 USDC, sending max available: ${ethers.formatUnits(usdcBal, 6)} USDC`);
        if (usdcBal > 0n) {
            const tx1 = await usdc.transfer(ESCROW_BASE, usdcBal);
            console.log(`Tx submitted: ${tx1.hash}`);
            await tx1.wait();
            console.log(`✅ Max USDC returned to Base Contract!`);
        }
    }

    // 2. Revert USDT (0.03 USDT = 30000 units)
    const usdt = new ethers.Contract(BASE_USDT, ERC20_ABI, relayerWallet);
    const usdtBal = await usdt.balanceOf(relayerWallet.address);
    console.log(`\nRelayer Base USDT Balance: ${ethers.formatUnits(usdtBal, 6)} USDT`);

    const usdtToRevert = 30000n; // exact amount withdrawn earlier
    if (usdtBal >= usdtToRevert) {
        console.log(`Transferring back ${ethers.formatUnits(usdtToRevert, 6)} USDT to ${ESCROW_BASE}...`);
        const tx2 = await usdt.transfer(ESCROW_BASE, usdtToRevert);
        console.log(`Tx submitted: ${tx2.hash}`);
        await tx2.wait();
        console.log(`✅ USDT returned to Base Contract!`);
    } else {
        if (usdtBal > 0n) {
            const tx2 = await usdt.transfer(ESCROW_BASE, usdtBal);
            console.log(`Tx submitted: ${tx2.hash}`);
            await tx2.wait();
            console.log(`✅ Max USDT returned to Base Contract!`);
        }
    }

    console.log("\n==================================================");
    console.log("🎉 Revert complete! Base funds restored to original contract.");
    console.log("==================================================");
}

main().catch(console.error);
