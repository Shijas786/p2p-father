import { ethers } from "ethers";
import { env } from "../src/config/env";
import { db } from "../src/db/client";

async function main() {
    console.log("=== Refunding 10 USDC to @freesapien ===");
    const targetUser = "59368569-4f61-4a19-a2d0-fedeff2fa23c"; // @freesapien
    const userWallet = "0x6540Bb882aE5b710C5a0efd9F76dada30ac7F9cF";

    const baseProvider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const relayerWallet = new ethers.Wallet(env.RELAYER_PRIVATE_KEY, baseProvider);

    console.log("Relayer Address:", relayerWallet.address);

    const erc20Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)",
        "function decimals() view returns (uint8)"
    ];

    const usdcContract = new ethers.Contract(env.USDC_ADDRESS, erc20Abi, relayerWallet);

    const relayerBal = await usdcContract.balanceOf(relayerWallet.address);
    console.log(`Relayer USDC Balance: ${ethers.formatUnits(relayerBal, 6)} USDC`);

    const amountToSend = ethers.parseUnits("10.0", 6);

    if (relayerBal < amountToSend) {
        console.error("Relayer does not have enough USDC to send 10 USDC directly.");
        return;
    }

    console.log(`Sending 10 USDC to @freesapien's wallet ${userWallet}...`);
    const tx = await usdcContract.transfer(userWallet, amountToSend);
    console.log("Tx Submitted! Hash:", tx.hash);
    await tx.wait(1);
    console.log("✅ Successfully refunded 10 USDC on Base to @freesapien!");
}

main().catch(console.error);
