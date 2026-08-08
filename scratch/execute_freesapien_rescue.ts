import { ethers } from "ethers";
import { env } from "../src/config/env";

async function main() {
    console.log("=== Executing Escrow Rescue for @freesapien ===");

    const freesapienWallet = "0x6540Bb882aE5b710C5a0efd9F76dada30ac7F9cF";
    const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
    const relayerWallet = new ethers.Wallet(env.RELAYER_PRIVATE_KEY, provider);

    console.log("Admin/Relayer Wallet:", relayerWallet.address);

    const escrowAbi = [
        "function emergencyWithdraw(address token, uint256 amount)"
    ];
    const erc20Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)"
    ];

    const escrow = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, escrowAbi, relayerWallet);
    const usdc = new ethers.Contract(env.USDC_ADDRESS, erc20Abi, relayerWallet);

    const escrowUsdcBal = await usdc.balanceOf(env.ESCROW_CONTRACT_ADDRESS);
    console.log(`Current Base Escrow USDC Balance: ${ethers.formatUnits(escrowUsdcBal, 6)} USDC`);

    const rescueAmount = ethers.parseUnits("10.0", 6);

    if (escrowUsdcBal < rescueAmount) {
        console.error("Escrow contract does not have 10 USDC balance!");
        return;
    }

    // Step 1: Emergency withdraw 10 USDC from Escrow to Relayer
    console.log("Step 1: Emergency withdrawing 10 USDC from Escrow contract...");
    const tx1 = await escrow.emergencyWithdraw(env.USDC_ADDRESS, rescueAmount);
    console.log("Tx1 Submitted! Hash:", tx1.hash);
    await tx1.wait(1);
    console.log("✅ Step 1 complete!");

    // Step 2: Transfer 10 USDC to @freesapien wallet
    console.log(`Step 2: Transferring 10 USDC directly to @freesapien (${freesapienWallet})...`);
    const tx2 = await usdc.transfer(freesapienWallet, rescueAmount);
    console.log("Tx2 Submitted! Hash:", tx2.hash);
    await tx2.wait(1);
    console.log("🎉 Step 2 complete! 10 USDC successfully delivered on Base to @freesapien!");
}

main().catch(console.error);
