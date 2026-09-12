import { ethers } from "ethers";
import { db } from "../db/client";
import { getQualifyingVIPConfig } from "../config/feeCashback";
import { bot } from "../bot";
import { getFastProvider } from "../utils/provider";
import { env } from "../config/env";

const ERC20_TRANSFER_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)"
];

const CHAIN_TOKENS: Record<string, Record<string, { address: string; decimals: number }>> = {
    bsc: {
        USDT: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
        USDC: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
    },
    base: {
        USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
        USDT: { address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 },
    }
};

export async function sendCashbackOnChain(
    chain: string,
    tokenSymbol: string,
    recipientAddress: string,
    cashbackAmount: number
): Promise<string | null> {
    try {
        if (!env.RELAYER_PRIVATE_KEY) {
            console.error("[FEE CASHBACK ON-CHAIN] RELAYER_PRIVATE_KEY not configured");
            return null;
        }

        const normalizedChain = chain === 'base' ? 'base' : 'bsc';
        const tokenConfig = CHAIN_TOKENS[normalizedChain]?.[tokenSymbol.toUpperCase()];
        if (!tokenConfig) {
            console.error(`[FEE CASHBACK ON-CHAIN] Token ${tokenSymbol} on chain ${chain} not supported for automated transfer`);
            return null;
        }

        const provider = getFastProvider(normalizedChain);
        const relayerWallet = new ethers.Wallet(env.RELAYER_PRIVATE_KEY, provider);

        const tokenContract = new ethers.Contract(tokenConfig.address, ERC20_TRANSFER_ABI, relayerWallet);
        const amountWei = ethers.parseUnits(cashbackAmount.toFixed(tokenConfig.decimals), tokenConfig.decimals);

        console.log(`[FEE CASHBACK ON-CHAIN] Transferring ${cashbackAmount} ${tokenSymbol} to ${recipientAddress} on ${normalizedChain}...`);

        const tx = await tokenContract.transfer(recipientAddress, amountWei);
        console.log(`[FEE CASHBACK ON-CHAIN] Tx submitted: ${tx.hash}`);

        await tx.wait(1);
        console.log(`[FEE CASHBACK ON-CHAIN] Tx confirmed! Hash: ${tx.hash}`);
        return tx.hash;
    } catch (err: any) {
        console.error("[FEE CASHBACK ON-CHAIN] Transfer error:", err.message || err);
        return null;
    }
}

export class FeeCashbackService {
    private processedTrades = new Set<string>();

    /**
     * Checks if a trade qualifies for VIP fee cashback (e.g. rebate for qualifying VIP users)
     * and credits the fee rebate to the VIP user automatically on-chain.
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

            let vipConfig = getQualifyingVIPConfig(
                orderCreator.telegram_id,
                orderCreator.username,
                order.created_at
            );

            // If user has tier === 'vip' in DB, qualify automatically for 0.25% rebate (25 bps)
            if (!vipConfig && (orderCreator as any).tier === "vip") {
                vipConfig = {
                    telegramId: orderCreator.telegram_id ? orderCreator.telegram_id.toString() : "",
                    username: orderCreator.username || "",
                    rebateBps: 25,
                    applyAfterTimestamp: 0
                };
            }

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

            // Execute automated on-chain token transfer from Relayer to VIP recipient
            const recipientAddress = orderCreator.receive_address || orderCreator.wallet_address;
            let cashbackTxHash: string | null = null;
            if (recipientAddress && ethers.isAddress(recipientAddress)) {
                cashbackTxHash = await sendCashbackOnChain(
                    trade.chain || 'bsc',
                    trade.token || 'USDT',
                    recipientAddress,
                    cashbackAmount
                );
            } else {
                console.warn(`[FEE CASHBACK ON-CHAIN] No valid wallet address found for @${orderCreator.username}`);
            }

            // Build explorer transaction links
            let txLinkSection = "";
            if (cashbackTxHash && cashbackTxHash.startsWith("0x")) {
                const explorerUrl = trade.chain === "base"
                    ? `https://basescan.org/tx/${cashbackTxHash}`
                    : `https://bscscan.com/tx/${cashbackTxHash}`;
                txLinkSection = `\n🔗 <b>Rebate Transfer Tx:</b> <a href="${explorerUrl}">View on ${trade.chain === "base" ? "Basescan" : "BscScan"}</a>\n`;
            } else if (trade.release_tx_hash && trade.release_tx_hash.startsWith("0x")) {
                const explorerUrl = trade.chain === "base"
                    ? `https://basescan.org/tx/${trade.release_tx_hash}`
                    : `https://bscscan.com/tx/${trade.release_tx_hash}`;
                txLinkSection = `\n🔗 <b>Trade Release Tx:</b> <a href="${explorerUrl}">View on ${trade.chain === "base" ? "Basescan" : "BscScan"}</a>\n`;
            }

            // Notify VIP User via Telegram Bot if available
            try {
                if (orderCreator.telegram_id && bot) {
                    await bot.api.sendMessage(
                        Number(orderCreator.telegram_id),
                        `🎁 <b>VIP Fee Cashback Sent!</b>\n\n` +
                        `You received a <b>${cashbackAmount.toFixed(4)} ${trade.token}</b> (0.25%) fee rebate transferred directly to your wallet for Trade #${trade.id.slice(0, 8)}.\n` +
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
