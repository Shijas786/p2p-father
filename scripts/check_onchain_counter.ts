import { ethers } from "ethers";
import { env } from "../src/config/env";

const ESCROW_ABI = [
    "function tradeCounter() view returns (uint256)",
    "function getTrade(uint256 tradeId) view returns (tuple(address seller, address buyer, address token, uint256 amount, uint256 feeAmount, uint256 buyerReceives, uint8 status, uint256 createdAt, uint256 deadline, uint256 fiatSentAt, uint256 autoReleaseDeadline, address disputeInitiator, string disputeReason))",
];

async function main() {
    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const contract = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, provider);

    console.log("Checking On-chain Trade Counter...");
    const counter = await contract.tradeCounter();
    console.log(`Trade Counter: ${counter}`);

    if (counter >= 2) {
        console.log("\nChecking Trade ID 2...");
        const trade = await contract.getTrade(2);
        console.log("Trade 2 details:");
        console.log(`- Seller: ${trade.seller}`);
        console.log(`- Buyer: ${trade.buyer}`);
        console.log(`- Amount: ${ethers.formatUnits(trade.amount, 6)} USDC`);
        console.log(`- Status: ${trade.status}`);
    }
}

main().catch(console.error);
