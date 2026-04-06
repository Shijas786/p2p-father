import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
const ESCROW_ABI = [
    "function feeCollector() view returns (address)",
    "function owner() view returns (address)",
    "function totalFeesCollected(address) view returns (uint256)"
];

const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

async function main() {
    const rpcUrl = process.env.BSC_RPC_URL;
    const contractAddress = process.env.ESCROW_CONTRACT_ADDRESS_BSC;

    if (!rpcUrl || !contractAddress) {
        console.error("Missing BSC_RPC_URL or ESCROW_CONTRACT_ADDRESS_BSC in .env");
        return;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(contractAddress, ESCROW_ABI, provider);
    const usdt = new ethers.Contract(USDT_BSC, ERC20_ABI, provider);

    const balance = await usdt.balanceOf(contractAddress);
    const collector = await contract.feeCollector();
    const owner = await contract.owner();
    const totalFees = await contract.totalFeesCollected(USDT_BSC);

    console.log("BSC Escrow Contract:", contractAddress);
    console.log("USDT Balance:", ethers.formatUnits(balance, 18), "USDT");
    console.log("Fee Collector:", collector);
    console.log("Owner:", owner);
    console.log("Total Fees Collected (Counter):", ethers.formatUnits(totalFees, 18), "USDT");
}

main().catch(console.error);
