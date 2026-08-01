import { db } from "../db/client";
import { getQualifyingVIPConfig } from "../config/feeCashback";
import { bot } from "../bot";

export class FeeCashbackService {
    private processedTrades = new Set<string>();

    /**
     * Checks if a trade qualifies for VIP fee cashback (e.g. 0.25% for @vip_trader on new ads)
     * and credits the fee rebate to the VIP user.
     */
    async processTradeFeeCashback(tradeId: string): Promise<void> {
        if (this.processedTrades.has(tradeId)) return;
        this.processedTrades.add(tradeId);

        try {
            const trade = await db.getTradeById(tradeId);
            if (!trade || !trade.order_id) return;

            const order = await db.getOrderById(trade.order_id);
            if (!order) return;

            const sellerUser = await db.getUserById(trade.seller_id);
            const buyerUser = await db.getUserById(trade.buyer_id);

            // Check if seller or buyer is a qualifying VIP trader on new ads
            const orderCreator = (order.user_id === trade.seller_id) ? sellerUser : buyerUser;
            if (!orderCreator) return;

            const vipConfig = getQualifyingVIPConfig(
                orderCreator.telegram_id,
                orderCreator.username,
                order.created_at
            );

            if (!vipConfig) {
                console.log(`[FEE CASHBACK] Trade ${tradeId} (Order ${order.id}) does not qualify for VIP fee cashback.`);
                return;
            }

            const tradeAmount = parseFloat(trade.amount?.toString() || "0");
            if (tradeAmount <= 0) return;

            // Calculate 0.25% (25 bps) cashback amount
            const cashbackAmount = (tradeAmount * vipConfig.rebateBps) / 10000;
            console.log(`[FEE CASHBACK] Qualifying VIP Trade found for @${vipConfig.username}!`);
            console.log(`[FEE CASHBACK] Trade Amount: ${tradeAmount} ${trade.token} | Rebate (0.25%): ${cashbackAmount} ${trade.token}`);

            // Build explorer transaction link if available
            let txLinkSection = "";
            if (trade.release_tx_hash && trade.release_tx_hash.startsWith("0x")) {
                const explorerUrl = trade.chain === "base"
                    ? `https://basescan.org/tx/${trade.release_tx_hash}`
                    : `https://bscscan.com/tx/${trade.release_tx_hash}`;
                txLinkSection = `\n🔗 <b>Transaction Link:</b> <a href="${explorerUrl}">View on ${trade.chain === "base" ? "Basescan" : "BscScan"}</a>\n`;
            }

            // Notify VIP User via Telegram Bot if available
            try {
                if (orderCreator.telegram_id && bot) {
                    await bot.api.sendMessage(
                        Number(orderCreator.telegram_id),
                        `🎁 <b>VIP Fee Cashback Credited!</b>\n\n` +
                        `You received a <b>${cashbackAmount.toFixed(4)} ${trade.token}</b> (0.25%) fee rebate for Trade #${trade.id.slice(0, 8)}.\n` +
                        `${txLinkSection}\n` +
                        `Thank you for trading with P2PFather! 🚀`,
                        { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
                    );
                }
            } catch (notifyErr: any) {
                console.error("[FEE CASHBACK] Failed to send Telegram notification:", notifyErr.message || notifyErr);
            }

        } catch (err: any) {
            console.error("[FEE CASHBACK] Error processing fee cashback for trade:", err.message || err);
        }
    }
}

export const feeCashbackService = new FeeCashbackService();
