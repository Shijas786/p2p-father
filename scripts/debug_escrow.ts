
import { ethers } from "hardhat";

async function main() {
    console.log("Starting Debug process...");

    // Setup Provider & Wallet
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const wallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY!, provider);
    const relayerAddress = wallet.address;

    console.log(`\nRelayer Address: ${relayerAddress}`);

    // Check ETH Balance
    const balance = await provider.getBalance(relayerAddress);
    console.log(`ETH Balance: ${ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
        console.error("❌ CRITICAL: Relayer has 0 ETH! Cannot execute transactions.");
    } else if (balance < ethers.parseEther("0.001")) {
        console.warn("⚠️ WARNING: Low ETH balance. Transactions might fail.");
    } else {
        console.log("✅ ETH Balance looks sufficient.");
    }

    // Contract Setup
    const escrowAddress = process.env.ESCROW_CONTRACT_ADDRESS!;
    console.log(`\nChecking Contract at: ${escrowAddress}`);

    const Escrow = await ethers.getContractFactory("P2PEscrow");
    const escrow = Escrow.attach(escrowAddress).connect(wallet);

    // Check Relayer Approval
    try {
        const isApproved = await escrow.approvedRelayers(relayerAddress);
        console.log(`Is Relayer Approved? ${isApproved}`);
        if (!isApproved) console.error("❌ CRITICAL: This wallet is NOT an approved relayer!");
        else console.log("✅ Relayer is approved.");
    } catch (e) {
        console.error("Error checking relayer approval:", e);
    }

    // Check Fee Collector
    try {
        const feeCollector = await escrow.feeCollector();
        console.log(`Fee Collector: ${feeCollector}`);
    } catch (e) {
        console.error("Error checking fee collector:", e);
    }

    // Check Owner
    try {
        const owner = await escrow.owner();
        console.log(`Contract Owner: ${owner}`);
        if (owner === relayerAddress) {
            console.log("✅ Current Wallet IS the Owner. (Allowed to relay)");
        } else {
            console.warn("⚠️ Current Wallet IS NOT the Owner.");
        }
    } catch (e) {
        console.error("Error checking owner:", e);
    }
    // Check Token Approvals
    const tokens = [
        { name: "USDC", address: process.env.USDC_ADDRESS },
        { name: "USDT", address: process.env.USDT_ADDRESS }
    ];

    for (const token of tokens) {
        if (!token.address) continue;
        try {
            const isApproved = await escrow.approvedTokens(token.address);
            console.log(`Is ${token.name} (${token.address}) Approved? ${isApproved}`);
            if (!isApproved) console.warn(`⚠️ Warning: ${token.name} is NOT approved for trading.`);
        } catch (e) {
            console.error(`Error checking ${token.name}:`, e);
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
