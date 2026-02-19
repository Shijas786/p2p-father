import { ethers } from "hardhat";

async function main() {
    console.log("🚀 Deploying P2P Escrow to Binance Smart Chain (BSC)...");

    const [deployer] = await ethers.getSigners();
    console.log("👤 Deployer Address:", deployer.address);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("💰 Balance:", ethers.formatEther(balance), "BNB");

    if (balance === BigInt(0)) {
        console.error("❌ Balance is 0! Send BNB to deployer.");
        process.exit(1);
    }

    // Deploy
    const feeCollector = process.env.ADMIN_WALLET_ADDRESS || deployer.address;
    console.log("🏦 Fee Collector set as:", feeCollector);

    // Addresses
    let usdcAddress = "";

    // Check network
    const network = await ethers.provider.getNetwork();

    if (network.chainId === BigInt(56)) {
        // BSC
        usdcAddress = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
        console.log("🌍 Network: BSC Mainnet");
    } else if (network.chainId === BigInt(8453)) {
        // Base
        usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
        console.log("🌍 Network: Base Mainnet");
    } else {
        console.error("❌ Unsupported network!", network.chainId);
        process.exit(1);
    }

    console.log("💵 USDC Address:", usdcAddress);

    console.log("Params:", feeCollector, usdcAddress);

    // Get Factory
    const Escrow = await ethers.getContractFactory("contracts/P2PEscrow.sol:P2PEscrow");

    if (!Escrow.bytecode || Escrow.bytecode === "0x") {
        console.error("❌ CRTITICAL: Contract bytecode is empty!");
        process.exit(1);
    }
    console.log("✅ Contract bytecode present. Length:", Escrow.bytecode.length);

    // Deploy
    console.log("🚀 Deploying P2P Escrow...");

    // Explicit override for gas price if needed (commented out but ready)
    // const feeData = await ethers.provider.getFeeData();
    // console.log("Fee Data:", feeData);

    const escrow = await Escrow.deploy(feeCollector, usdcAddress);

    console.log("⏳ Waiting for deployment...");
    await escrow.waitForDeployment();

    const address = await escrow.getAddress();
    console.log("✅ P2PEscrow Deployed to BSC at:", address);

    // If fee collector is different, or just for safety, approve deployer as relayer
    if (deployer.address !== feeCollector) {
        console.log("🔗 Adding deployer as approved relayer...");
        await (await escrow.setRelayer(deployer.address, true)).wait();
        console.log("✅ Deployer added as Relayer");
    }

    console.log("\n👇 NEXT STEPS:");
    console.log(`1. Update .env with ESCROW_CONTRACT_ADDRESS_BSC=${address}`);
    console.log(`2. Verify contract: npx hardhat verify --network bsc ${address} ${feeCollector} ${usdcAddress}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
