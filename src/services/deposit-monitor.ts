import { ethers } from "ethers";
import { db } from "../db/client";
import { wallet as walletService } from "./wallet";
import { polymarketRelayerService } from "./relayer";

// ─── Constants ───────────────────────────────────────────────────

/** Minimum USDC.e that must land before we attempt a wrap (in atomic units, 6 decimals) */
const MIN_WRAP_AMOUNT = BigInt(1_000_000); // = 1.0 USDC.e

/** How often the monitor scans all wallets (ms) */
const DEFAULT_INTERVAL_MS = 30_000; // 30 seconds

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon.llamarpc.com";

/** USDC.e on Polygon — the token the Collateral Onramp consumes */
const USDCE_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

/** pUSD — Polymarket's native collateral (target token after wrap) */
const PUSD_ADDRESS  = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";

const ERC20_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
];

// ─── Deposit Monitor ─────────────────────────────────────────────

/**
 * DepositMonitor
 * 
 * Background service that scans every user's derived wallet on Polygon
 * for incoming USDC.e. When a balance above the minimum is detected it
 * automatically calls the Polymarket Collateral Onramp to wrap it into
 * pUSD — no user action required.
 *
 * Flow per wallet every cycle:
 *   1. Read USDC.e balance on Polygon
 *   2. If balance >= 1 USDC.e → trigger depositGasless() (approve + wrap)
 *   3. Verify pUSD balance increased as a sanity check
 *   4. Mark wallet as done for this cycle; wait for next interval
 *
 * Safety:
 *   - `inProgress` Set prevents concurrent wrap for the same wallet
 *   - Errors per-wallet are isolated; one failure never blocks others
 *   - Works in demo mode: relayer returns a simulated hash
 */
class DepositMonitor {
    private isRunning = false;
    private shouldStop = false;
    /** Single shared provider to prevent multiple eth_chainId requests */
    private provider = new ethers.JsonRpcProvider(POLYGON_RPC, 137, { staticNetwork: true });

    /** Wallet addresses currently mid-wrap — skip on next tick */
    private inProgress = new Set<string>();

    /** Total wraps triggered since process start */
    private wrapCount = 0;

    // ─── Public API ──────────────────────────────────────────────

    start(intervalMs = DEFAULT_INTERVAL_MS): void {
        if (this.isRunning) {
            console.warn("[DepositMonitor] Already running — skipping duplicate start()");
            return;
        }

        console.log(`[DepositMonitor] 🟢 Started. Scanning wallets for USDC.e → pUSD auto-wrap.`);
        this.isRunning = true;
        this.shouldStop = false;

        this.monitorLoop(intervalMs).catch(err => console.error("[DepositMonitor] Loop error:", err));
    }

    stop(): void {
        this.shouldStop = true;
        this.isRunning = false;
        console.log(`[DepositMonitor] 🔴 Stopped. Total wraps triggered: ${this.wrapCount}`);
    }

    private async monitorLoop(intervalMs: number): Promise<void> {
        while (!this.shouldStop) {
            try {
                await this.scanAll();
            } catch (err) {
                console.error("[DepositMonitor] Scan error:", err);
            }
            if (this.shouldStop) break;
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
    }

    // ─── Core Scan ───────────────────────────────────────────────

    private async scanAll(): Promise<void> {
        // Fetch all users that have a wallet_index assigned
        let users: { wallet_index: number; wallet_address: string | null }[] = [];

        try {
            const dbClient = (db as any).getClient();
            const { data, error } = await dbClient
                .from("users")
                .select("wallet_index, wallet_address")
                .not("wallet_index", "is", null)
                .order("wallet_index", { ascending: true });

            if (error) throw error;
            users = data || [];
        } catch (err: any) {
            console.error("[DepositMonitor] Failed to fetch users:", err.message);
            return;
        }

        if (users.length === 0) return;

        // Process sequentially (1 at a time) to completely avoid Infura rate limits.
        // Ethers batches Promises, so Promise.allSettled with >1 can trigger batch-rejection on free RPCs.
        const BATCH_SIZE = 1;
        for (let i = 0; i < users.length; i += BATCH_SIZE) {
            if (this.shouldStop) break;
            const batch = users.slice(i, i + BATCH_SIZE);
            await Promise.allSettled(
                batch.map(u => this.checkAndWrap(u.wallet_index, u.wallet_address))
            );
            // Wait 1000ms between each wallet check (max 1 RPS)
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    private async checkAndWrap(walletIndex: number, knownAddress: string | null): Promise<void> {
        // Derive the deterministic wallet address for this user
        let address: string;
        try {
            address = knownAddress || walletService.deriveWallet(walletIndex).address;
        } catch {
            return; // Can't derive — skip
        }

        // Skip if a wrap is already in progress for this wallet
        if (this.inProgress.has(address)) return;

        try {
            const usdce = new ethers.Contract(USDCE_ADDRESS, ERC20_ABI, this.provider);

            // 1. Check incoming USDC.e balance
            const usdceBalance: bigint = await usdce.balanceOf(address);

            if (usdceBalance < MIN_WRAP_AMOUNT) {
                // Nothing to wrap — silent skip
                return;
            }

            const amountFormatted = ethers.formatUnits(usdceBalance, 6);
            console.log(`[DepositMonitor] 💵 Detected ${amountFormatted} USDC.e in wallet #${walletIndex} (${address}). Wrapping to pUSD...`);

            // 2. Lock this wallet to prevent concurrent wraps
            this.inProgress.add(address);

            // 3. Trigger the wrap: approve Collateral Onramp + call wrap()
            const txHash = await polymarketRelayerService.depositGasless(walletIndex, usdceBalance);
            this.wrapCount++;

            console.log(`[DepositMonitor] ✅ Wrap successful for wallet #${walletIndex}! ${amountFormatted} USDC.e → pUSD | TX: ${txHash}`);

            // 4. Sanity check: confirm pUSD balance increased
            try {
                const pusd = new ethers.Contract(PUSD_ADDRESS, ERC20_ABI, this.provider);
                const pusdBalance: bigint = await pusd.balanceOf(address);
                console.log(`[DepositMonitor] 📊 pUSD balance after wrap: ${ethers.formatUnits(pusdBalance, 6)} pUSD`);
            } catch {
                // Non-critical — don't rethrow
            }

        } catch (err: any) {
            console.error(`[DepositMonitor] ❌ Wrap failed for wallet #${walletIndex} (${address}):`, err.message);
        } finally {
            // Always unlock the wallet so the next cycle can retry
            this.inProgress.delete(address);
        }
    }
}

export const depositMonitor = new DepositMonitor();

/** Convenience function used in src/index.ts alongside other jobs */
export function startDepositMonitor(intervalMs?: number): void {
    depositMonitor.start(intervalMs);
}
