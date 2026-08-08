import { ethers } from "ethers";
import { env } from "../src/config/env";

async function main() {
    console.log("=== Inspecting On-Chain Trade #123 on Base Escrow ===");
    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);

    const abi = [
        "function getTrade(uint256 tradeId) view returns (tuple(address seller, uint8 status, uint32 createdAt, uint32 deadline, address buyer, uint32 fiatSentAt, address token, address disputeInitiator, uint256 amount, uint256 feeAmount, uint256 buyerReceives))",
        "function balances(address user, address token) view returns (uint256)"
    ];

    const contract = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, abi, provider);

    const trade123 = await contract.getTrade(123);
    console.log("Trade 123 Details:", {
        seller: trade123.seller,
        buyer: trade123.buyer,
        token: trade123.token,
        amount: ethers.formatUnits(trade123.amount, 6),
        buyerReceives: ethers.formatUnits(trade123.buyerReceives, 6),
        status: trade123.status
    });

    const sellerBal = await contract.balances(trade123.seller, trade123.token);
    console.log("Seller Vault Balance for this token:", ethers.formatUnits(sellerBal, 6));

    // Also check previous trade IDs around 123 (e.g. 120, 121, 122, 124, 125)
    for (let id = 115; id <= 130; id++) {
        try {
            const t = await contract.getTrade(id);
            if (t.seller.toLowerCase() === "0x6540bb882ae5b710c5a0efd9f76dada30ac7f9cf") {
                console.log(`Trade #${id} (Seller @freesapien):`, {
                    amount: ethers.formatUnits(t.amount, 6),
                    status: t.status,
                    buyer: t.buyer
                });
            }
        } catch (e) {}
    }
}

main().catch(console.error);
