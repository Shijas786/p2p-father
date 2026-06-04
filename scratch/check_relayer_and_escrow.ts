import { escrow } from "../src/services/escrow";
import { db } from "../src/db/client";
import { env } from "../src/config/env";
import { ethers } from "ethers";

async function run() {
    console.log("Relayer Address on BSC:", (escrow as any).getRelayer('bsc').address);
    
    // Get relayer BNB balance
    const bnbBalance = await escrow.getRelayerBalance(undefined, 'bsc');
    console.log("Relayer BNB Balance:", bnbBalance);

    // Get escrow contract address on BSC
    const escrowAddr = (escrow as any).getContractAddress('bsc');
    console.log("Escrow Contract Address on BSC:", escrowAddr);

    // Query trade 55 on BSC contract
    try {
        const contract = (escrow as any).getEscrowContract('bsc');
        const contractTrade = await contract.getTrade(55);
        console.log("Contract Trade Details for ID 55:");
        console.log({
            seller: contractTrade.seller,
            status: contractTrade.status, // 0 = None, 1 = Active, 2 = FiatSent, 3 = Completed, 4 = Refunded, 5 = Disputed
            createdAt: Number(contractTrade.createdAt),
            deadline: Number(contractTrade.deadline),
            buyer: contractTrade.buyer,
            fiatSentAt: Number(contractTrade.fiatSentAt),
            token: contractTrade.token,
            disputeInitiator: contractTrade.disputeInitiator,
            amount: ethers.formatUnits(contractTrade.amount, 18), // USDT on BSC is 18 decimals in this contract
            feeAmount: ethers.formatUnits(contractTrade.feeAmount, 18),
            buyerReceives: ethers.formatUnits(contractTrade.buyerReceives, 18),
        });
    } catch (err: any) {
        console.error("Failed to query trade on BSC contract:", err.message);
    }
}

run();
