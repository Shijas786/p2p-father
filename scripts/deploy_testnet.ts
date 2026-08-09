import { ethers } from "hardhat";

async function main() {
    console.log("🚀 Preparing Testnet P2P Escrow Contract Deployment...");

    const [deployer] = await ethers.getSigners();
    console.log("👤 Deployer Address:", deployer.address);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("💰 Deployer Balance:", ethers.formatEther(balance));

    if (balance === BigInt(0)) {
        console.error("❌ Deployer balance is 0! Send testnet gas (tBNB or Sepolia ETH) to:", deployer.address);
        process.exit(1);
    }

    const feeCollector = process.env.ADMIN_WALLET_ADDRESS || deployer.address;
    const network = await ethers.provider.getNetwork();
    console.log("🌐 Network Chain ID:", network.chainId.toString());

    // Testnet USDT address on BSC Testnet (or mock)
    let usdtAddress = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"; 

    if (network.chainId === BigInt(84532)) {
        // Base Sepolia USDC
        usdtAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    }

    console.log("🏦 Fee Collector:", feeCollector);
    console.log("💵 Testnet Token:", usdtAddress);

    const Escrow = await ethers.getContractFactory("contracts/P2PEscrow.sol:P2PEscrow");
    console.log("🚀 Deploying P2PEscrow...");

    const initialTokens = [usdtAddress, "0x0000000000000000000000000000000000000000"];
    const escrow = await Escrow.deploy(feeCollector, initialTokens);
    await escrow.waitForDeployment();

    const deployedAddress = await escrow.getAddress();
    console.log("\n✅ P2PEscrow SUCCESSFULLY DEPLOYED TO TESTNET!");
    console.log("📍 Deployed Contract Address:", deployedAddress);

    console.log("\n👇 NEXT STEPS:");
    console.log(`1. Update ESCROW_CONTRACT_ADDRESS_TESTNET=${deployedAddress}`);
    console.log(`2. Approve relayer if needed.`);
}

main().catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exitCode = 1;
});
