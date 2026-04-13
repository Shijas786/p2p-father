import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const ESCROW_ABI = [
    "function feeBps() view returns (uint256)",
    "function setFeeBps(uint256 newFeeBps)",
];

async function main() {
    const pk = process.env.RELAYER_PRIVATE_KEY;
    const rpc = process.env.BASE_RPC_URL;
    const contractAddr = process.env.ESCROW_CONTRACT_ADDRESS;

    if (!pk || !rpc || !contractAddr) {
        console.error("❌ Missing required environment variables (RELAYER_PRIVATE_KEY, BASE_RPC_URL, ESCROW_CONTRACT_ADDRESS)");
        return;
    }

    console.log(`\n═══ Base Chain Fee Update ═══`);
    console.log(`Contract: ${contractAddr}`);

    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(pk, provider);
    const escrow = new ethers.Contract(contractAddr, ESCROW_ABI, wallet);

    try {
        // Read current fee
        const currentFee = await escrow.feeBps();
        console.log(`Current feeBps on Base: ${currentFee} (${Number(currentFee) / 100}%)`);

        if (Number(currentFee) === 0) {
            console.log("✅ Already set to 0 bps (0%). Skipping.");
            return;
        }

        // Set to 0 bps (0%)
        console.log("Setting feeBps to 0 (0% FEE)...");

        const tx = await escrow.setFeeBps(0);
        console.log(`TX sent: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ Confirmed in block ${receipt.blockNumber}`);

        // Verify
        const newFee = await escrow.feeBps();
        console.log(`New feeBps: ${newFee} (0%)`);
        console.log("\n🎉 Done! Base contract is now 0% fee.");
    } catch (err: any) {
        console.error("❌ Failed to update fee. Are you the owner?");
        console.error(err.message);
    }
}

main().catch(console.error);
