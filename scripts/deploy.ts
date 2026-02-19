import { ethers } from "hardhat";

async function main() {
    console.log("🚀 Deploying P2P Escrow to Base Mainnet...");

    const [deployer] = await ethers.getSigners();
    console.log("👤 Deployer Address:", deployer.address);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("💰 Balance:", ethers.formatEther(balance), "ETH");

    if (balance === BigInt(0)) {
        console.error("❌ Balance is 0! Send ETH to deployer.");
        process.exit(1);
    }

    // Deploy
    const Escrow = await ethers.getContractFactory("P2PEscrow");
    // Set feeCollector as deployer (or env variable if you prefer)
    // Set feeCollector as deployer (or env variable if you prefer)
    const feeCollector = process.env.ADMIN_WALLET_ADDRESS || deployer.address;
    console.log("🏦 Fee Collector set as:", feeCollector);

    const usdcAddress = process.env.USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    if (!ethers.isAddress(usdcAddress)) {
        throw new Error("Invalid USDC address");
    }
    console.log("💵 USDC Address:", usdcAddress);

    const escrow = await Escrow.deploy(feeCollector, usdcAddress);

    await escrow.waitForDeployment();
    const address = await escrow.getAddress();

    console.log("✅ Escrow Contract Deployed to:", address);

    // If fee collector is different, or just for safety, approve deployer as relayer
    if (deployer.address !== feeCollector) {
        console.log("🔗 Adding deployer as approved relayer...");
        await (await escrow.setRelayer(deployer.address, true)).wait();
        console.log("✅ Deployer added as Relayer");
    }
    console.log("\n IMPORTANT: Update .env with ESCROW_CONTRACT_ADDRESS=" + address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
