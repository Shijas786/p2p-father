import { escrow } from "../src/services/escrow";
import { db } from "../src/db/client";
import { bot } from "../src/bot";
import { config } from "dotenv";
config();

async function notifyUser(userId: string, htmlMessage: string) {
    try {
        const user = await db.getUserById(userId);
        if (user && user.telegram_id) {
            console.log(`Sending Telegram notification to user ${user.username || user.first_name} (ID: ${user.telegram_id})...`);
            await bot.api.sendMessage(user.telegram_id, htmlMessage, { parse_mode: "HTML" });
            console.log("Notification sent successfully.");
        } else {
            console.warn(`User ${userId} has no telegram_id or does not exist.`);
        }
    } catch (err: any) {
        console.error(`Failed to send Telegram notification to user ${userId}:`, err.message);
    }
}

async function run() {
    const tradeId = 'fa0595c5-cd83-4a48-8c0d-49cf5f4c5cb0';
    console.log(`Starting refund execution for trade ID: ${tradeId}...`);

    // 1. Fetch trade from DB
    const trade = await db.getTradeById(tradeId);
    if (!trade) {
        console.error("Trade not found in database!");
        return;
    }

    console.log("Current DB Trade details:", {
        id: trade.id,
        on_chain_trade_id: trade.on_chain_trade_id,
        status: trade.status,
        amount: trade.amount,
        token: trade.token,
        chain: trade.chain,
        seller_id: trade.seller_id,
        buyer_id: trade.buyer_id,
        order_id: trade.order_id
    });

    if (trade.status !== 'fiat_sent' && trade.status !== 'disputed') {
        console.warn(`Warning: Trade status in DB is '${trade.status}', not 'fiat_sent' or 'disputed'. Proceeding anyway...`);
    }

    if (!trade.on_chain_trade_id) {
        console.error("On-chain trade ID is missing!");
        return;
    }

    const onChainTradeId = trade.on_chain_trade_id;
    const chain = trade.chain as any; // 'bsc'

    // 2. Query trade on blockchain to double-check status
    console.log(`Checking trade ${onChainTradeId} on ${chain} blockchain...`);
    const contract = (escrow as any).getEscrowContract(chain);
    const contractTrade = await contract.getTrade(onChainTradeId);
    const onChainStatus = Number(contractTrade.status);
    console.log(`On-chain Trade Status: ${onChainStatus} (1 = Active, 2 = FiatSent, 3 = Completed, 4 = Refunded, 5 = Disputed)`);

    // 0 = None, 1 = Active, 2 = FiatSent, 3 = Disputed, 4 = Completed, 5 = Refunded, 6 = Cancelled
    // Wait, let's verify our enum definition from Solidity:
    // enum TradeStatus { None, Active, FiatSent, Disputed, Completed, Refunded, Cancelled }
    // Active is 1, FiatSent is 2, Disputed is 3, Completed is 4, Refunded is 5, Cancelled is 6.
    if (onChainStatus !== 1 && onChainStatus !== 2 && onChainStatus !== 3) {
        console.error(`On-chain status is ${onChainStatus}, which is not refundable. Aborting.`);
        return;
    }

    // 3. Execute escrow refund on-chain
    console.log(`Executing on-chain refund for trade ${onChainTradeId} on ${chain}...`);
    let txHash: string;
    try {
        txHash = await escrow.refund(onChainTradeId, chain);
        console.log(`On-chain refund successful! Transaction Hash: ${txHash}`);
    } catch (err: any) {
        console.error("Escrow refund transaction failed:", err);
        return;
    }

    // 4. Update trade status in DB
    console.log("Updating trade status in database...");
    await db.updateTrade(trade.id, {
        status: "refunded",
        completed_at: new Date().toISOString() as any,
        release_tx_hash: txHash as any,
        resolution: "Refunded to seller (Buyer did not pay)" as any,
        resolved_by: trade.seller_id // Use seller_id or another valid ID since we're running as system
    });
    console.log("Database trade status updated to 'refunded'.");

    // 5. Revert order fill in DB
    console.log(`Reverting fill on parent order ID: ${trade.order_id}...`);
    try {
        await db.revertFillOrder(trade.order_id, trade.amount);
        console.log("Order fill reverted successfully.");
    } catch (err: any) {
        console.error("Failed to revert order fill:", err.message);
    }

    // 6. Create trade system message
    console.log("Creating chat system message for trade...");
    try {
        await db.createTradeMessage({
            trade_id: trade.id,
            user_id: trade.seller_id,
            message: "✅ Dispute resolved: Refunded to Seller (Buyer did not pay).",
            type: "system"
        });
        console.log("Chat system message created.");
    } catch (err: any) {
        console.error("Failed to create chat system message:", err.message);
    }

    // 7. Send Telegram notifications
    console.log("Sending Telegram notifications to parties...");
    
    // Notify Seller
    const sellerMsg = `🔙 <b>Dispute Resolved!</b>\n\nYour <b>${trade.amount} ${trade.token}</b> has been refunded to your Vault.\n\nReason: Buyer did not pay.`;
    await notifyUser(trade.seller_id, sellerMsg);

    // Notify Buyer
    const buyerMsg = `❌ <b>Dispute Resolved!</b>\n\nThe trade for <b>${trade.amount} ${trade.token}</b> has been cancelled/refunded by the Admin.\n\nReason: Buyer did not pay.`;
    await notifyUser(trade.buyer_id, buyerMsg);

    console.log("Refund flow completed successfully!");
}

run().catch(e => {
    console.error("CRITICAL ERROR in execution run:", e);
});
