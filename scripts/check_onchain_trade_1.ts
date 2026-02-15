import { ethers } from "ethers";
import { env } from "../src/config/env";

const ESCROW_ABI = [
    "function getTrade(uint256 tradeId) view returns (tuple(address seller, address buyer, address token, uint256 amount, uint256 feeAmount, uint256 buyerReceives, uint8 status, uint256 createdAt, uint256 deadline, uint256 fiatSentAt, uint256 autoReleaseDeadline, address disputeInitiator, string disputeReason))",
];

async function main() {
    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const contract = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, provider);

    console.log("Checking On-chain Trade ID 1 on Base...");
    try {
        const trade = await contract.getTrade(1);
        console.log("On-chain Trade ID 1 Details:");
        console.log(`- Seller: ${trade.seller}`);
        console.log(`- Buyer: ${trade.buyer}`);
        console.log(`- Amount: ${ethers.formatUnits(trade.amount, 6)} USDC`);
        console.log(`- Status: ${trade.status} (1=Active, 2=FiatSent, 4=Completed, 5=Refunded, 6=Cancelled)`);
        console.log(`- Deadline: ${new Date(Number(trade.deadline) * 1000).toISOString()}`);
    } catch (err) {
        console.error("Error fetching trade:", err);
    }
}

main().catch(console.error);
