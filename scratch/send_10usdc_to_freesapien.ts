import { ethers } from "ethers";
import { env } from "../src/config/env";

async function main() {
    console.log("=== Transferring 10 USDC from Admin Wallet to @freesapien ===");

    const freesapienWallet = "0x6540Bb882aE5b710C5a0efd9F76dada30ac7F9cF";
    const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
    const adminSigner = new ethers.Wallet(env.RELAYER_PRIVATE_KEY, provider);

    const erc20Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)"
    ];

    const usdc = new ethers.Contract(env.USDC_ADDRESS, erc20Abi, adminSigner);

    const adminBal = await usdc.balanceOf(adminSigner.address);
    console.log(`Admin Wallet USDC Balance: ${ethers.formatUnits(adminBal, 6)} USDC`);

    const amountToSend = ethers.parseUnits("10.0", 6);

    console.log(`Transferring 10 USDC to @freesapien (${freesapienWallet})...`);
    const tx = await usdc.transfer(freesapienWallet, amountToSend);
    console.log("Tx Submitted! Hash:", tx.hash);
    console.log("Waiting for Base confirmation...");
    await tx.wait(1);

    const finalAdminBal = await usdc.balanceOf(adminSigner.address);
    const finalUserBal = await usdc.balanceOf(freesapienWallet);

    console.log("\n🎉 SUCCESS!");
    console.log(`Admin USDC Bal: ${ethers.formatUnits(finalAdminBal, 6)} USDC`);
    console.log(`@freesapien USDC Bal: ${ethers.formatUnits(finalUserBal, 6)} USDC`);
    console.log(`BaseScan Tx: https://basescan.org/tx/${tx.hash}`);
}

main().catch(console.error);
