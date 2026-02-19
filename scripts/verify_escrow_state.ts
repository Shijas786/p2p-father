import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const ESCROW_ABI = [
    "function approvedTokens(address) view returns (bool)",
    "function approvedRelayers(address) view returns (bool)",
    "function feeCollector() view returns (address)",
];

const RELAYER_ADDRESS = ethers.getAddress("0xCDA639dfd4a66A3d2023591BF6617C4076611260".toLowerCase());
const BASE_USDC = ethers.getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase());
const BASE_USDT = ethers.getAddress("0xfde4C96C8593536E31F229EA8f37B2ADa2699bb2".toLowerCase());
const BSC_USDC = ethers.getAddress("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d".toLowerCase());
const BSC_USDT = ethers.getAddress("0x55d398326f99059fF775485246999027B3197955".toLowerCase());

async function checkChain(chainName: string, rpcUrl: string, contractAddress: string, tokens: { name: string, addr: string }[]) {
    console.log(`\n--- Checking ${chainName} ---`);
    console.log(`Contract: ${contractAddress}`);

    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const contract = new ethers.Contract(contractAddress, ESCROW_ABI, provider);

        const relayerApproved = await contract.approvedRelayers(RELAYER_ADDRESS);
        console.log(`Relayer ${RELAYER_ADDRESS}: ${relayerApproved ? "✅ APPROVED" : "❌ NOT APPROVED"}`);

        const feeCollector = await contract.feeCollector();
        console.log(`Fee Collector: ${feeCollector}`);

        for (const token of tokens) {
            const approved = await contract.approvedTokens(token.addr);
            console.log(`${token.name} (${token.addr}): ${approved ? "✅ APPROVED" : "❌ NOT APPROVED"}`);
        }
    } catch (err: any) {
        console.error(`Error checking ${chainName}:`, err.message);
    }
}

async function main() {
    await checkChain(
        "Base",
        process.env.BASE_RPC_URL!,
        process.env.ESCROW_CONTRACT_ADDRESS!,
        [{ name: "USDC", addr: BASE_USDC }, { name: "USDT", addr: BASE_USDT }]
    );

    await checkChain(
        "BSC",
        process.env.BSC_RPC_URL!,
        process.env.ESCROW_CONTRACT_ADDRESS_BSC!,
        [{ name: "USDC", addr: BSC_USDC }, { name: "USDT", addr: BSC_USDT }]
    );
}

main();
