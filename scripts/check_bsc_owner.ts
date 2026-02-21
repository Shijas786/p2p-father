import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const ESCROW_ABI = [
    "function owner() view returns (address)",
    "function approvedRelayers(address) view returns (bool)",
    "function approvedTokens(address) view returns (bool)",
];

const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
const USDC_BSC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";

async function main() {
    const rpcUrl = process.env.BSC_RPC_URL!;
    const contractAddress = process.env.ESCROW_CONTRACT_ADDRESS_BSC!;
    const relayerKey = process.env.RELAYER_PRIVATE_KEY!;

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const relayerWallet = new ethers.Wallet(relayerKey, provider);
    const contract = new ethers.Contract(contractAddress, ESCROW_ABI, provider);

    console.log("Relayer Address:", relayerWallet.address);

    const owner = await contract.owner();
    console.log("Contract Owner:", owner);

    const isRelayerApproved = await contract.approvedRelayers(relayerWallet.address);
    console.log("Is Relayer Approved:", isRelayerApproved);

    const isUsdtApproved = await contract.approvedTokens(USDT_BSC);
    console.log("Is USDT Approved:", isUsdtApproved);

    const isUsdcApproved = await contract.approvedTokens(USDC_BSC);
    console.log("Is USDC Approved:", isUsdcApproved);

    if (owner.toLowerCase() === relayerWallet.address.toLowerCase()) {
        console.log("✅ Relayer IS the owner. We can approve the tokens ourselves.");
    } else {
        console.log("❌ Relayer is NOT the owner. Admin intervention needed or use owner key.");
    }
}

main().catch(console.error);
