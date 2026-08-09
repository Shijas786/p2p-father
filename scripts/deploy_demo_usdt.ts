import { ethers } from "hardhat";

async function main() {
    console.log("🚀 Deploying DemoUSDT (Tether USD / USDT) to BSC Testnet...");

    const [deployer] = await ethers.getSigners();
    console.log("👤 Deployer Address:", deployer.address);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("💰 Deployer Balance:", ethers.formatEther(balance), "tBNB");

    if (balance === BigInt(0)) {
        console.error("❌ Deployer has 0 tBNB balance!");
        process.exit(1);
    }

    const demoUsdtAddress = "0x21d4945A5499107F19F819dA1ab9133902A58EAB";
    console.log("📍 Deployed Demo USDT Contract Address:", demoUsdtAddress);

    // Register token with P2PEscrow on BSC Testnet
    const escrowAddress = process.env.ESCROW_CONTRACT_ADDRESS_BSC_TESTNET || "0x5ED1dC490061Bf9e281B849B6D4ed17feE84F260";
    console.log(`\n🔗 Registering Demo USDT with P2PEscrow at ${escrowAddress}...`);

    try {
        const escrowAbi = [
            "function setApprovedToken(address _token, bool _approved) external",
            "function approvedTokens(address _token) external view returns (bool)"
        ];
        const escrowContract = new ethers.Contract(escrowAddress, escrowAbi, deployer);

        const isApproved = await escrowContract.approvedTokens(demoUsdtAddress);
        if (!isApproved) {
            const tx = await escrowContract.setApprovedToken(demoUsdtAddress, true);
            console.log(`⚡ setApprovedToken Tx sent: ${tx.hash}`);
            await tx.wait();
            console.log("🎉 Demo USDT approved on P2PEscrow successfully!");
        } else {
            console.log("ℹ️ Demo USDT is ALREADY approved on P2PEscrow!");
        }
    } catch (err: any) {
        console.warn("⚠️ Note on P2PEscrow token registration:", err.message);
    }

    console.log("\n=================================================");
    console.log("📝 BSC Testnet USDT Address:");
    console.log(`0x21d4945A5499107F19F819dA1ab9133902A58EAB`);
    console.log("=================================================");
}

main().catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exitCode = 1;
});
