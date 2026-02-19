import { ethers } from "hardhat";

async function main() {
    const adminAddress = process.env.ADMIN_WALLET_ADDRESS;
    if (!adminAddress) {
        console.error("❌ ADMIN_WALLET_ADDRESS not set in .env");
        process.exit(1);
    }

    console.log(`🔍 Scanning for contracts deployed by: ${adminAddress}`);

    const provider = ethers.provider;
    const network = await provider.getNetwork();
    console.log(`🌍 Network: ${network.name} (ChainId: ${network.chainId})`);

    const nonce = await provider.getTransactionCount(adminAddress);
    console.log(`📦 Total Transactions (Nonce): ${nonce}`);

    const targetAddresses = [
        "0xee4489A1FE8aC867299d1524Ee5D6E30b0329952",
        "0x6622c3f316483c98F0362C016eE333Eba0E38f3E"
    ];

    console.log(`\n⏳ Checking all ${nonce} potential contract addresses...`);

    let foundCount = 0;

    for (let i = 0; i < nonce; i++) {
        const contractAddress = ethers.getCreateAddress({
            from: adminAddress,
            nonce: i
        });

        const code = await provider.getCode(contractAddress);

        if (code !== "0x") {
            foundCount++;
            console.log(`✅ [Nonce ${i}] Found Contract: ${contractAddress}`);

            // Optional: Check if it's P2PEscrow by checking for 'feeBps()'
            // Selector for feeBps() is 0x... (calculated dynamically if needed)
            // But just listing is enough for now.
        } else {
            // console.log(`❌ [Nonce ${i}] No code at ${contractAddress}`);
        }
    }

    console.log(`\n🎉 Scan Complete. Found ${foundCount} active contracts.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
