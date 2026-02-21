import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const ESCROW_ABI = [
    "function setApprovedToken(address token, bool approved)",
    "function setRelayer(address relayer, bool approved)",
    "function approvedTokens(address) view returns (bool)",
    "function approvedRelayers(address) view returns (bool)",
];

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_USDT = "0xfde4C96C8593536E31F229EA8f37B2ADa2699bb2";
const BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

async function approveOnChain(
    chainName: string,
    rpcUrl: string,
    contractAddress: string,
    relayerKey: string,
    tokens: { name: string; addr: string }[]
) {
    console.log(`\n--- Processing ${chainName} ---`);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(relayerKey, provider);
    const contract = new ethers.Contract(contractAddress, ESCROW_ABI, wallet);

    console.log(`Using Wallet: ${wallet.address}`);

    // 1. Approve Relayer (itself)
    console.log(`Checking Relayer approval for ${wallet.address}...`);
    const isRelayerApproved = await contract.approvedRelayers(wallet.address);
    if (!isRelayerApproved) {
        console.log(`Approving Relayer...`);
        const tx = await contract.setRelayer(wallet.address, true);
        console.log(`Tx Sent: ${tx.hash}`);
        await tx.wait();
        console.log(`✅ Relayer Approved.`);
    } else {
        console.log(`✅ Relayer already approved.`);
    }

    // 2. Approve Tokens
    for (const token of tokens) {
        const tokenAddr = ethers.getAddress(token.addr.toLowerCase());
        console.log(`Checking Token approval for ${token.name} (${tokenAddr})...`);
        const isTokenApproved = await contract.approvedTokens(tokenAddr);
        if (!isTokenApproved) {
            console.log(`Approving ${token.name}...`);
            const tx = await contract.setApprovedToken(tokenAddr, true);
            console.log(`Tx Sent: ${tx.hash}`);
            await tx.wait();
            console.log(`✅ ${token.name} Approved.`);
        } else {
            console.log(`✅ ${token.name} already approved.`);
        }
    }
}

async function main() {
    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKey) throw new Error("RELAYER_PRIVATE_KEY not found in .env");

    // Base
    await approveOnChain(
        "Base",
        process.env.BASE_RPC_URL!,
        process.env.ESCROW_CONTRACT_ADDRESS!,
        relayerKey,
        [
            { name: "USDC", addr: BASE_USDC },
            { name: "USDT", addr: BASE_USDT }
        ]
    );

    // BSC
    await approveOnChain(
        "BSC",
        process.env.BSC_RPC_URL!,
        process.env.ESCROW_CONTRACT_ADDRESS_BSC!,
        relayerKey,
        [
            { name: "USDC", addr: BSC_USDC },
            { name: "USDT", addr: BSC_USDT }
        ]
    );

    console.log("\n🚀 All approvals processed successfully!");
}

main().catch(console.error);
