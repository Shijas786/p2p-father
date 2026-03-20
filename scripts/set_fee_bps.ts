import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const ESCROW_ABI = [
    "function feeBps() view returns (uint256)",
    "function setFeeBps(uint256 newFeeBps)",
    "function feeCollector() view returns (address)",
    "function totalFeesCollected(address) view returns (uint256)",
];

async function main() {
    const pk = process.env.RELAYER_PRIVATE_KEY!;

    const chains = [
        {
            name: "Base",
            rpc: process.env.BASE_RPC_URL!,
            contract: process.env.ESCROW_CONTRACT_ADDRESS!,
        },
        {
            name: "BSC",
            rpc: process.env.BSC_RPC_URL!,
            contract: process.env.ESCROW_CONTRACT_ADDRESS_BSC!,
        },
    ];

    for (const chain of chains) {
        console.log(`\n═══ ${chain.name} ═══`);
        console.log(`Contract: ${chain.contract}`);

        const provider = new ethers.JsonRpcProvider(chain.rpc);
        const wallet = new ethers.Wallet(pk, provider);
        const escrow = new ethers.Contract(chain.contract, ESCROW_ABI, wallet);

        // Read current fee
        const currentFee = await escrow.feeBps();
        console.log(`Current feeBps: ${currentFee} (${Number(currentFee) / 100}%)`);

        const feeCollector = await escrow.feeCollector();
        console.log(`Fee Collector: ${feeCollector}`);

        if (Number(currentFee) === 50) {
            console.log("✅ Already set to 50 bps (0.5%). Skipping.");
            continue;
        }

        // Set to 50 bps (0.5%)
        console.log("Setting feeBps to 50 (0.5%)...");

        const txOptions: any = {};
        if (chain.name === "BSC") {
            txOptions.gasPrice = ethers.parseUnits("0.1", "gwei");
        }

        const tx = await escrow.setFeeBps(50, txOptions);
        console.log(`TX sent: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ Confirmed in block ${receipt.blockNumber}`);

        // Verify
        const newFee = await escrow.feeBps();
        console.log(`New feeBps: ${newFee} (${Number(newFee) / 100}%)`);
    }

    console.log("\n🎉 Done! Both contracts now charge 0.5% fee.");
}

main().catch(console.error);
