import { ethers } from "hardhat";

async function main() {
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId;

    console.log(`🚀 Deploying P2P Escrow V2 to Chain ID: ${chainId}...`);

    const [deployer] = await ethers.getSigners();
    console.log("👤 Deployer Address:", deployer.address);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("💰 Balance:", ethers.formatEther(balance));

    const feeCollector = process.env.ADMIN_WALLET_ADDRESS || deployer.address;
    const usdcAddress = chainId === BigInt(56)
        ? "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
        : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

    const Escrow = await ethers.getContractFactory("contracts/P2PEscrow_V2.sol:P2PEscrow");

    console.log("📦 Deploying V2...");

    // Explicit gas settings for tight budget
    const gasLimit = 2500000; // Hardcoded safety
    const gasPrice = ethers.parseUnits("0.1", "gwei"); // Budget price

    try {
        const escrow = await Escrow.deploy(feeCollector, usdcAddress, {
            gasLimit: gasLimit,
            gasPrice: gasPrice
        });

        console.log("⏳ Waiting for deployment...");
        await escrow.waitForDeployment();
        const address = await escrow.getAddress();
        console.log("✅ P2PEscrow V2 Deployed at:", address);

    } catch (e: any) {
        console.error("❌ Failed!");
        console.error(e.message);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
