const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // TODO: Replace with the actual USDC token address on Base or Base Sepolia
    const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base Mainnet USDC
    
    // The trusted signer for EIP-712 vouchers. 
    // Usually the same as the relayer/bot wallet.
    const TRUSTED_SIGNER = deployer.address; 

    console.log("USDC Token Address:", USDC_ADDRESS);
    console.log("Trusted Signer Address:", TRUSTED_SIGNER);

    const ReferralRewards = await ethers.getContractFactory("ReferralRewards");

    console.log("Deploying ReferralRewards proxy...");
    const rewards = await upgrades.deployProxy(ReferralRewards, [USDC_ADDRESS, TRUSTED_SIGNER], {
        kind: "uups",
    });

    await rewards.waitForDeployment();
    const proxyAddress = await rewards.getAddress();

    console.log("ReferralRewards deployed to:", proxyAddress);

    // Save the contract address to env or config
    console.log(`\nNext steps:
1. Add the proxy address to your backend .env: REWARD_CONTRACT_ADDRESS=${proxyAddress}
2. Ensure the trusted signer private key is in your backend .env
3. Fund the contract ${proxyAddress} with USDC so it can pay out rewards!`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
