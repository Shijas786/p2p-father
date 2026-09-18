import { ethers } from "ethers";
import { db } from "../db/client";
import { getQualifyingVIPConfig, MIN_VIP_CASHBACK_TRADE_USD } from "../config/feeCashback";
import { bot } from "../bot";
import { getFastProvider } from "../utils/provider";
import { env } from "../config/env";
import { redis } from "./redis";

const ERC20_TRANSFER_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
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
): Promise<{ txHash: string | null; error?: string }> {
    try {
        if (!env.RELAYER_PRIVATE_KEY) {
            console.error("[FEE CASHBACK ON-CHAIN] RELAYER_PRIVATE_KEY not configured");
            return { txHash: null, error: "RELAYER_PRIVATE_KEY not configured" };
        }

        const normalizedChain = chain === 'base' ? 'base' : 'bsc';
        const tokenConfig = CHAIN_TOKENS[normalizedChain]?.[tokenSymbol.toUpperCase()];
        if (!tokenConfig) {
            const err = `Token ${tokenSymbol} on chain ${chain} not supported for automated transfer`;
            console.error(`[FEE CASHBACK ON-CHAIN] ${err}`);
            return { txHash: null, error: err };
        }

        const provider = getFastProvider(normalizedChain);
        const relayerWallet = new ethers.Wallet(env.RELAYER_PRIVATE_KEY, provider);

        const tokenContract = new ethers.Contract(tokenConfig.address, ERC20_TRANSFER_ABI, relayerWallet);
        const amountWei = ethers.parseUnits(cashbackAmount.toFixed(tokenConfig.decimals), tokenConfig.decimals);

        // Pre-check relayer token balance before attempting transfer
        try {
            const relayerBalance: bigint = await tokenContract.balanceOf(relayerWallet.address);
            if (relayerBalance < amountWei) {
                const balFormatted = ethers.formatUnits(relayerBalance, tokenConfig.decimals);
                const neededFormatted = ethers.formatUnits(amountWei, tokenConfig.decimals);
                const err = `Insufficient relayer balance: has ${balFormatted} ${tokenSymbol}, needs ${neededFormatted} ${tokenSymbol}`;
                console.error(`[FEE CASHBACK ON-CHAIN] ${err} on ${normalizedChain} (Relayer: ${relayerWallet.address})`);
                return { txHash: null, error: err };
            }
        } catch (balErr: any) {
            console.warn(`[FEE CASHBACK ON-CHAIN] Could not pre-verify relayer balance:`, balErr?.message || balErr);
        }

        console.log(`[FEE CASHBACK ON-CHAIN] Transferring ${cashbackAmount} ${tokenSymbol} to ${recipientAddress} on ${normalizedChain}...`);

        let lastErr: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const feeData = await provider.getFeeData().catch(() => null);
                const txOptions: any = {};
                if (normalizedChain === 'bsc') {
                    txOptions.gasPrice = feeData?.gasPrice || ethers.parseUnits("3", "gwei");
                }

                const tx = await tokenContract.transfer(recipientAddress, amountWei, txOptions);
                console.log(`[FEE CASHBACK ON-CHAIN] Tx submitted (attempt ${attempt + 1}): ${tx.hash}`);

                await tx.wait(1);
                console.log(`[FEE CASHBACK ON-CHAIN] Tx confirmed! Hash: ${tx.hash}`);
                return { txHash: tx.hash };
            } catch (err: any) {
                lastErr = err;
                console.error(`[FEE CASHBACK ON-CHAIN] Attempt ${attempt + 1} failed:`, err?.message || err);
                if (attempt < 2) {
                    await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
                }
            }
        }

        return { txHash: null, error: lastErr?.message || "Failed after 3 attempts" };
    } catch (err: any) {
        console.error("[FEE CASHBACK ON-CHAIN] Transfer error:", err.message || err);
        return { txHash: null, error: err?.message || String(err) };
    }
}

export class FeeCashbackService {
    private processedTrades = new Set<string>();

    /**
     * Checks if a trade qualifies for VIP fee cashback (e.g. rebate for qualifying VIP users)
     * and credits the fee rebate to qualifying VIP users automatically on-chain.
     */
    async processTradeFeeCashback(tradeId: string): Promise<void> {
        try {
            const trade = await db.getTradeById(tradeId);
            if (!trade) return;

            const tradeAmount = parseFloat(trade.amount?.toString() || "0");
            if (tradeAmount <= 0) return;

            const sellerUser = trade.seller_id ? await db.getUserById(trade.seller_id) : null;
            const buyerUser = trade.buyer_id ? await db.getUserById(trade.buyer_id) : null;

            // Check both parties in the trade (whether maker or taker)
            const participants = [
                { user: sellerUser, role: 'seller' },
                { user: buyerUser, role: 'buyer' }
            ].filter((p): p is { user: NonNullable<typeof p.user>; role: string } => Boolean(p.user));

            for (const { user, role } of participants) {
                // Check if user qualifies as VIP (either via config or tier === 'vip' in DB)
                let vipConfig = getQualifyingVIPConfig(
                    user.telegram_id,
                    user.username,
                    trade.created_at
                );

                if (!vipConfig && (user as any).tier === "vip") {
                    vipConfig = {
                        telegramId: user.telegram_id ? user.telegram_id.toString() : "",
                        username: user.username || user.first_name || "VIP Trader",
                        rebateBps: 25,
                        applyAfterTimestamp: 0,
                        minTradeUsd: 100
                    };
                }

                if (!vipConfig) continue;

                // Idempotency: avoid duplicate transfers for this trade and user
                const memoryKey = `${trade.id}:${user.id}`;
                if (this.processedTrades.has(memoryKey)) continue;

                const cacheKey = `cashback_sent:${trade.id}:${user.id}`;
                const alreadyProcessed = await redis.get(cacheKey).catch(() => null);
                if (alreadyProcessed) {
                    console.log(`[FEE CASHBACK] Trade ${trade.id} for user ${user.id} already processed (${alreadyProcessed}).`);
                    this.processedTrades.add(memoryKey);
                    continue;
                }

                // Minimum threshold: VIP fee cashback is only for trades of $100 and above
                const tokenSymbol = (trade.token || "USDT").toUpperCase();
                let tradeValueUsd = tradeAmount;
                if (tokenSymbol !== "USDT" && tokenSymbol !== "USDC") {
                    if (trade.rate && Number(trade.rate) > 0 && trade.fiat_amount) {
                        tradeValueUsd = Number(trade.fiat_amount) / Number(trade.rate);
                    }
                }

                const minRequiredUsd = vipConfig.minTradeUsd ?? MIN_VIP_CASHBACK_TRADE_USD;
                if (tradeValueUsd < minRequiredUsd) {
                    console.log(`[FEE CASHBACK] Trade #${trade.id.slice(0, 8)} value ($${tradeValueUsd.toFixed(2)}) is below the $${minRequiredUsd} threshold for VIP rebate. Skipping.`);
                    continue;
                }

                // Calculate 0.25% (25 bps) cashback amount
                const cashbackAmount = (tradeAmount * vipConfig.rebateBps) / 10000;
                if (cashbackAmount < 0.0001) continue;

                console.log(`[FEE CASHBACK] Qualifying VIP Trade found for @${vipConfig.username} (${role})!`);
                console.log(`[FEE CASHBACK] Trade Amount: ${tradeAmount} ${trade.token} | Rebate (0.25%): ${cashbackAmount} ${trade.token}`);

                const recipientAddress = user.receive_address || user.wallet_address;
                if (!recipientAddress || !ethers.isAddress(recipientAddress)) {
                    console.warn(`[FEE CASHBACK ON-CHAIN] No valid wallet address found for @${user.username || user.id}`);
                    continue;
                }

                this.processedTrades.add(memoryKey);

                // Execute automated on-chain token transfer from Relayer to VIP recipient
                const result = await sendCashbackOnChain(
                    trade.chain || 'bsc',
                    trade.token || 'USDT',
                    recipientAddress,
                    cashbackAmount
                );

                if (result.txHash && result.txHash.startsWith("0x")) {
                    // Mark as processed in Redis (30 days TTL)
                    await redis.setex(cacheKey, 86400 * 30, result.txHash).catch(() => {});

                    const explorerUrl = trade.chain === "base"
                        ? `https://basescan.org/tx/${result.txHash}`
                        : `https://bscscan.com/tx/${result.txHash}`;
                    const txLinkSection = `\n🔗 <b>Rebate Transfer Tx:</b> <a href="${explorerUrl}">View on ${trade.chain === "base" ? "Basescan" : "BscScan"}</a>\n`;

                    // Notify VIP User via Telegram Bot
                    try {
                        if (user.telegram_id && bot) {
                            await bot.api.sendMessage(
                                Number(user.telegram_id),
                                `🎁 <b>VIP 0% Fee Refund Sent!</b>\n\n` +
                                `As a VIP member, you trade with <b>0% Fee</b>! We have refunded the <b>0.25%</b> platform fee (<b>${cashbackAmount.toFixed(4)} ${trade.token}</b>) directly back to your wallet for Trade #${trade.id.slice(0, 8)}.\n` +
                                `${txLinkSection}\n` +
                                `Thank you for trading with P2PFather! 🚀`,
                                { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
                            );
                        }
                    } catch (notifyErr: any) {
                        console.error("[FEE CASHBACK] Failed to send Telegram notification:", notifyErr.message || notifyErr);
                    }
                } else {
                    // Transfer failed (e.g. relayer balance or RPC issue)
                    console.error(`[FEE CASHBACK] On-chain transfer failed for trade ${trade.id} user ${user.id}:`, result.error);

                    // Alert Admin immediately so the relayer can be funded
                    if (env.ADMIN_IDS && env.ADMIN_IDS.length > 0 && bot) {
                        const adminTgId = env.ADMIN_IDS[0];
                        bot.api.sendMessage(
                            adminTgId,
                            `⚠️ <b>VIP Fee Cashback FAILED!</b>\n\n` +
                            `• <b>User:</b> @${user.username || user.first_name} (<code>${user.id}</code>)\n` +
                            `• <b>Trade:</b> #${trade.id.slice(0, 8)} (${tradeAmount} ${trade.token} on ${trade.chain})\n` +
                            `• <b>Cashback Due:</b> ${cashbackAmount.toFixed(4)} ${trade.token}\n` +
                            `• <b>Reason:</b> <code>${result.error || 'Unknown error'}</code>\n\n` +
                            `Please top up the Relayer wallet.`,
                            { parse_mode: "HTML" }
                        ).catch(console.error);
                    }
                }
            }
        } catch (err: any) {
            console.error("[FEE CASHBACK] Error processing fee cashback for trade:", err.message || err);
        }
    }
}

export const feeCashbackService = new FeeCashbackService();
