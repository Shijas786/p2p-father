import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    const escrowAddress = process.env.ESCROW_CONTRACT_ADDRESS_BSC || "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";
    const relayerAddress = process.env.ADMIN_WALLET_ADDRESS || "0x3A5668F8B3E167771d503F0321c42a7B082789Ef";

    console.log(`🛡️ Authorizing Relayer ${relayerAddress} on Escrow ${escrowAddress} (BSC)...`);

    const [deployer] = await ethers.getSigners();
    console.log("👤 Using Account (Owner):", deployer.address);

    const Escrow = await ethers.getContractAt([
        "function setRelayer(address relayer, bool approved)",
        "function approvedRelayers(address relayer) view returns (bool)"
    ], escrowAddress);

    // 1. Check current status
    const isApproved = await Escrow.approvedRelayers(relayerAddress);
    console.log(`Current status: ${isApproved ? "✅ APPROVED" : "❌ NOT APPROVED"}`);

    if (isApproved) {
        console.log("Skipping... already authorized.");
        return;
    }

    // 2. Set Relayer
    console.log("Sending authorization transaction...");
    const tx = await Escrow.setRelayer(relayerAddress, true, {
        gasPrice: ethers.parseUnits("0.1", "gwei"),
        gasLimit: 100000
    });

    console.log("⏳ Waiting for confirmation...");
    await tx.wait();
    console.log(`✅ Relayer authorized! TX: ${tx.hash}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
