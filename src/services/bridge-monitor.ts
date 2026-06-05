import { ethers } from "ethers";
import { db } from "../db/client";
import { bot } from "../bot";
import { polymarketRelayerService } from "./relayer";

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";

const ERC20_ABI = [
    "function balanceOf(address account) view returns (uint256)"
];

const POLL_INTERVAL_MS = 2 * 60 * 1000;   // check every 2 minutes
const EXPIRE_AFTER_MS  = 45 * 60 * 1000;  // alert & give up after 45 minutes
const CONFIRM_AFTER_MS = 3 * 60 * 1000;   // expect funds within 3 min on fast bridges

interface PendingBridgeDeposit {
    id: string;
    telegram_id: number;
    wallet_index: number;
    tx_hash: string;
    source_chain: string;
    amount_usdc: number;           // human-readable e.g. 1.0
    pusd_before: string;           // pUSD balance at time of deposit
    created_at: string;
    notified_arrived: boolean;
    notified_stuck: boolean;
}

class BridgeMonitor {
    private isRunning = false;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private provider = new ethers.JsonRpcProvider(POLYGON_RPC, 137, { staticNetwork: true });

    // ─── Public API ───────────────────────────────────────────────

    start(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log("[BridgeMonitor] 🟢 Started.");
        this.scheduleNext();
    }

    stop(): void {
        this.isRunning = false;
        if (this.timer) clearTimeout(this.timer);
        console.log("[BridgeMonitor] 🔴 Stopped.");
    }

    /**
     * Call this immediately after a cross-chain deposit is initiated.
     * Saves the deposit to the DB so the poller can track it.
     */
    async trackDeposit(params: {
        telegramId: number;
        walletIndex: number;
        txHash: string;
        sourceChain: string;
        amountUsdc: number;
    }): Promise<void> {
        try {
            // Snapshot pUSD balance before the bridge completes
            const depositWallet = await polymarketRelayerService.resolveDepositWallet(params.walletIndex);
            const pusd = new ethers.Contract(PUSD_ADDRESS, ERC20_ABI, this.provider);
            const balBefore: bigint = await pusd.balanceOf(depositWallet);

            const supabase = (db as any).getClient();
            await supabase.from("pending_bridge_deposits").insert({
                telegram_id: params.telegramId,
                wallet_index: params.walletIndex,
                tx_hash: params.txHash,
                source_chain: params.sourceChain,
                amount_usdc: params.amountUsdc,
                pusd_before: balBefore.toString(),
                notified_arrived: false,
                notified_stuck: false,
            });

            console.log(`[BridgeMonitor] 📝 Tracking bridge deposit ${params.txHash} (${params.amountUsdc} USDC on ${params.sourceChain})`);
        } catch (err: any) {
            // Non-fatal — don't throw, just log
            console.error("[BridgeMonitor] Failed to track deposit:", err.message);
        }
    }

    // ─── Poll Loop ───────────────────────────────────────────────

    private scheduleNext(): void {
        if (!this.isRunning) return;
        this.timer = setTimeout(() => {
            this.poll().catch(e => console.error("[BridgeMonitor] Poll error:", e));
        }, POLL_INTERVAL_MS);
    }

    private async poll(): Promise<void> {
        try {
            const supabase = (db as any).getClient();
            const { data: pending, error } = await supabase
                .from("pending_bridge_deposits")
                .select("*")
                .eq("notified_arrived", false);

            if (error || !pending || pending.length === 0) {
                return;
            }

            console.log(`[BridgeMonitor] Checking ${pending.length} pending bridge deposits...`);

            for (const deposit of pending as PendingBridgeDeposit[]) {
                await this.checkDeposit(deposit);
            }
        } finally {
            this.scheduleNext();
        }
    }

    private async checkDeposit(deposit: PendingBridgeDeposit): Promise<void> {
        const supabase = (db as any).getClient();
        const ageMs = Date.now() - new Date(deposit.created_at).getTime();

        try {
            const depositWallet = await polymarketRelayerService.resolveDepositWallet(deposit.wallet_index);
            const pusd = new ethers.Contract(PUSD_ADDRESS, ERC20_ABI, this.provider);
            const balNow: bigint = await pusd.balanceOf(depositWallet);
            const balBefore = BigInt(deposit.pusd_before);

            const expectedMin = BigInt(Math.floor(deposit.amount_usdc * 0.95 * 1_000_000)); // allow 5% slippage
            const arrived = balNow - balBefore >= expectedMin;

            if (arrived) {
                // ✅ Funds arrived — notify user and mark done
                const received = ethers.formatUnits(balNow - balBefore, 6);
                await this.notify(deposit.telegram_id,
                    `✅ <b>Deposit Confirmed!</b>\n\n` +
                    `Your <b>${deposit.amount_usdc} USDC</b> deposit from <b>${deposit.source_chain.toUpperCase()}</b> has arrived!\n` +
                    `<b>+${received} pUSD</b> added to your Polymarket balance.\n\n` +
                    `🔗 Source TX: <code>${deposit.tx_hash}</code>`
                );

                await supabase.from("pending_bridge_deposits")
                    .update({ notified_arrived: true })
                    .eq("id", deposit.id);

                console.log(`[BridgeMonitor] ✅ Bridge deposit ${deposit.tx_hash} confirmed for user ${deposit.telegram_id}`);
                return;
            }

            // ⚠️ Stuck — been too long, send one alert
            if (ageMs > EXPIRE_AFTER_MS && !deposit.notified_stuck) {
                await this.notify(deposit.telegram_id,
                    `⚠️ <b>Deposit Delayed</b>\n\n` +
                    `Your <b>${deposit.amount_usdc} USDC</b> deposit from <b>${deposit.source_chain.toUpperCase()}</b> hasn't arrived after 45 minutes.\n\n` +
                    `🔗 Source TX: <code>${deposit.tx_hash}</code>\n\n` +
                    `Please contact Polymarket support at <b>support.polymarket.com</b> with this TX hash to recover your funds.`
                );

                await supabase.from("pending_bridge_deposits")
                    .update({ notified_stuck: true, notified_arrived: true }) // mark done so we stop polling
                    .eq("id", deposit.id);

                console.warn(`[BridgeMonitor] ⚠️ Bridge deposit ${deposit.tx_hash} appears stuck after ${Math.round(ageMs / 60000)} min`);
                return;
            }

            console.log(`[BridgeMonitor] ⏳ ${deposit.tx_hash} — pUSD not yet arrived (age: ${Math.round(ageMs / 60000)}m)`);

        } catch (err: any) {
            console.error(`[BridgeMonitor] Error checking deposit ${deposit.tx_hash}:`, err.message);
        }
    }

    private async notify(telegramId: number, message: string): Promise<void> {
        try {
            await bot.api.sendMessage(telegramId, message, { parse_mode: "HTML" });
        } catch (err: any) {
            console.error(`[BridgeMonitor] Failed to send Telegram notification:`, err.message);
        }
    }
}

export const bridgeMonitor = new BridgeMonitor();
