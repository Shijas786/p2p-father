import { ethers } from "ethers";
import { env } from "../src/config/env";

async function main() {
    const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
    const escrowAbi = [
        "function owner() view returns (address)",
        "function feeCollector() view returns (address)"
    ];
    const contract = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, escrowAbi, provider);

    try {
        const ownerAddr = await contract.owner();
        console.log("Escrow Owner:", ownerAddr);
    } catch (e: any) {
        console.log("owner() error:", e.message);
    }

    try {
        const collectorAddr = await contract.feeCollector();
        console.log("Fee Collector:", collectorAddr);
    } catch (e: any) {
        console.log("feeCollector() error:", e.message);
    }

    // Check USDC balance of ownerAddr / feeCollector / ADMIN_WALLET_ADDRESS
    const erc20Abi = ["function balanceOf(address) view returns (uint256)"];
    const usdc = new ethers.Contract(env.USDC_ADDRESS, erc20Abi, provider);

    const adminAddr = env.ADMIN_WALLET_ADDRESS;
    console.log("Admin Wallet USDC Bal:", ethers.formatUnits(await usdc.balanceOf(adminAddr), 6));
}

main().catch(console.error);
