import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

// Try with different ABI versions if decoding fails
const ABI_V1 = [
    "function trades(uint256 tradeId) view returns (address seller, address buyer, address token, uint256 amount, uint256 feeAmount, uint256 buyerReceives, uint8 status, uint256 createdAt, uint256 deadline, uint256 fiatSentAt, address disputeInitiator, string disputeReason)",
    "function tradeCounter() view returns (uint256)",
    "function totalFeesCollected(address) view returns (uint256)"
];

const ABI_V2 = [
    "function trades(uint256 tradeId) view returns (address seller, address buyer, address token, uint256 amount, uint256 feeAmount, uint256 buyerReceives, uint8 status, uint256 createdAt, uint256 deadline, uint256 fiatSentAt, uint256 autoReleaseDeadline, address disputeInitiator, string disputeReason)",
    "function tradeCounter() view returns (uint256)",
    "function totalFeesCollected(address) view returns (uint256)"
];

const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

async function main() {
    const rpcUrl = process.env.BSC_RPC_URL;
    const contractAddress = process.env.ESCROW_CONTRACT_ADDRESS_BSC;

    if (!rpcUrl || !contractAddress) {
        console.error("Missing config in .env");
        return;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    let abi = ABI_V1;
    let contract = new ethers.Contract(contractAddress, abi, provider);

    // Test a trade with V1
    try {
        await contract.trades(1);
        console.log("Using ABI V1 (standard)");
    } catch (e) {
        console.log("ABI V1 failed, trying V2 (with autoReleaseDeadline)...");
        abi = ABI_V2;
        contract = new ethers.Contract(contractAddress, abi, provider);
        try {
            await contract.trades(1);
            console.log("Using ABI V2");
        } catch (e2) {
            console.error("Both V1 and V2 failed. Cannot decode trades.");
            return;
        }
    }

    const counter = await contract.tradeCounter();
    console.log(`Checking ${counter} trades on BSC...`);

    let totalFees = 0n;
    let completedFees = 0n;

    for (let i = 1; i <= Number(counter); i++) {
        try {
            const trade = await contract.trades(i);
            if (trade.token.toLowerCase() === USDT_BSC.toLowerCase()) {
                totalFees += trade.feeAmount;
                if (Number(trade.status) === 4) { // Completed
                    completedFees += trade.feeAmount;
                }
            }
        } catch (e) {
            console.error(`Error reading trade ${i}:`, e.message);
        }
    }

    const onChainCounter = await contract.totalFeesCollected(USDT_BSC);

    console.log(`\nCompleted Trades Fee Sum: ${ethers.formatUnits(completedFees, 18)} USDT`);
    console.log(`Total Trades Fee Sum (if all completed): ${ethers.formatUnits(totalFees, 18)} USDT`);
    console.log(`On-Chain Fee Counter: ${ethers.formatUnits(onChainCounter, 18)} USDT`);
}

main().catch(console.error);
