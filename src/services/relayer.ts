import { RelayClient } from "@polymarket/builder-relayer-client";
import { createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ethers } from "ethers";
import { wallet as walletService } from "./wallet";
import { env } from "../config/env";

// ═══════════════════════════════════════════════════════════════
//  Polymarket pUSD Token & Collateral Onramp Addresses (Polygon)
// ═══════════════════════════════════════════════════════════════

/** pUSD — Polymarket's native collateral token (ERC-20, Polygon) */
const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";

/** USDC.e (bridged) — legacy token still used as input to the onramp */
const USDCE_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

/** Collateral Onramp: wraps USDC.e → pUSD (1:1) */
const COLLATERAL_ONRAMP_ADDRESS = "0x93070a847efef7f70739046a929d47a521f5b8ee";

/** PermissionedRamp: wraps native USDC → pUSD (1:1) */
const PERMISSIONED_RAMP_ADDRESS = "0xebc2459ec962869ca4c0bd1e06368272732bcb08";

const POLYGON_RPC = "https://polygon-rpc.com";

// ─── ABIs ────────────────────────────────────────────────────────

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

/**
 * Collateral Onramp ABI — wraps USDC.e into pUSD (1:1).
 * Call sequence: approve(onramp, amount) → wrap(amount)
 */
const COLLATERAL_ONRAMP_ABI = [
  {
    name: "wrap",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: []
  }
] as const;

// ─── Service ─────────────────────────────────────────────────────

class PolymarketRelayerService {
    private isDemoMode = false;

    constructor() {
        const hasCredentials = (env as any).POLYMARKET_PRIVATE_KEY &&
                               (env as any).POLYMARKET_BUILDER_API_KEY &&
                               (env as any).POLYMARKET_BUILDER_SECRET &&
                               (env as any).POLYMARKET_BUILDER_PASSPHRASE;

        if (!hasCredentials) {
            console.warn("⚠️ Polymarket Builder credentials missing. Relayer operating in DEMO mode.");
            this.isDemoMode = true;
        }
    }

    /**
     * Helper to construct a RelayClient authenticated specifically for a user EOA
     */
    private getUserRelayClient(userWalletIndex: number): RelayClient | null {
        if (this.isDemoMode) return null;

        try {
            const derived = walletService.deriveWallet(userWalletIndex);
            const account = privateKeyToAccount(derived.privateKey as `0x${string}`);
            const wallet = createWalletClient({
                account,
                transport: http(POLYGON_RPC)
            });

            const creds = {
                apiKey: (env as any).POLYMARKET_BUILDER_API_KEY || "",
                apiSecret: (env as any).POLYMARKET_BUILDER_SECRET || "",
                passphrase: (env as any).POLYMARKET_BUILDER_PASSPHRASE || ""
            };

            return new RelayClient(
                "https://relayer.polymarket.com",
                137, // Polygon chain ID
                wallet,
                creds as any
            );
        } catch (e) {
            console.error("Failed to create RelayClient:", e);
            return null;
        }
    }

    async resolveDepositWallet(userWalletIndex: number): Promise<string> {
        if (this.isDemoMode) {
            try {
                const derived = walletService.deriveWallet(userWalletIndex);
                return derived.address;
            } catch (e) {
                return "0x00000000000000000000000000000000000Demo";
            }
        }
        try {
            const client = this.getUserRelayClient(userWalletIndex);
            if (!client) throw new Error("Failed to construct relayer client");
            return await client.deriveDepositWalletAddress();
        } catch (err: any) {
            console.error("[Relayer] Failed to derive deposit wallet address:", err.message);
            try {
                const derived = walletService.deriveWallet(userWalletIndex);
                return derived.address;
            } catch (e) {
                return "0x00000000000000000000000000000000000Demo";
            }
        }
    }

    /**
     * Get the user's current pUSD balance in their Polymarket deposit wallet.
     */
    async getPusdBalance(userWalletIndex: number): Promise<string> {
        try {
            const depositWallet = await this.resolveDepositWallet(userWalletIndex);
            const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
            const pusd = new ethers.Contract(PUSD_ADDRESS, ERC20_ABI as any, provider);
            const balance = await pusd.balanceOf(depositWallet);
            return ethers.formatUnits(balance, 6); // pUSD has 6 decimals (same as USDC)
        } catch (e: any) {
            console.warn("[Relayer] Failed to fetch pUSD balance:", e.message);
            return "0.00";
        }
    }

    /**
     * Deposit funds into Polymarket by wrapping USDC.e → pUSD via the Collateral Onramp.
     *
     * Flow:
     *  1. User's EOA must have USDC.e on Polygon (bridged there by the cross-chain flow or manually).
     *  2. Approve the Collateral Onramp to spend the USDC.e amount.
     *  3. Call wrap(amount) on the Onramp — this mints pUSD 1:1 and sends it to the deposit wallet.
     *  4. Polymarket CLOB V2 detects the pUSD in the deposit wallet automatically.
     */
    async depositGasless(userWalletIndex: number, amount: bigint): Promise<string> {
        if (this.isDemoMode) {
            console.log(`[Relayer-Demo] Simulating pUSD deposit of ${amount} units (USDC.e → pUSD wrap)`);
            await new Promise(r => setTimeout(r, 1500));
            return "0x_simulated_pusd_deposit_tx_hash";
        }

        const derived = walletService.deriveWallet(userWalletIndex);
        const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
        const signer = new ethers.Wallet(derived.privateKey, provider);

        const usdce = new ethers.Contract(USDCE_ADDRESS, ERC20_ABI as any, signer);
        const onramp = new ethers.Contract(COLLATERAL_ONRAMP_ADDRESS, COLLATERAL_ONRAMP_ABI as any, signer);

        // Step 1: Check current USDC.e balance
        const usdceBalance = await usdce.balanceOf(signer.address);
        if (usdceBalance < amount) {
            throw new Error(
                `Insufficient USDC.e balance. Have: ${ethers.formatUnits(usdceBalance, 6)}, Need: ${ethers.formatUnits(amount, 6)}`
            );
        }

        // Step 2: Approve Collateral Onramp to spend USDC.e (skip if already approved)
        const currentAllowance = await usdce.allowance(signer.address, COLLATERAL_ONRAMP_ADDRESS);
        if (currentAllowance < amount) {
            console.log(`[Relayer] Approving Collateral Onramp to spend ${ethers.formatUnits(amount, 6)} USDC.e...`);
            const approveTx = await usdce.approve(COLLATERAL_ONRAMP_ADDRESS, amount);
            await approveTx.wait();
            console.log(`[Relayer] Approval confirmed: ${approveTx.hash}`);
            // Small delay to let RPC state settle
            await new Promise(r => setTimeout(r, 1000));
        }

        // Step 3: Wrap USDC.e → pUSD (1:1 via Collateral Onramp)
        console.log(`[Relayer] Wrapping ${ethers.formatUnits(amount, 6)} USDC.e → pUSD via Collateral Onramp...`);
        const wrapTx = await onramp.wrap(amount);
        const receipt = await wrapTx.wait();

        console.log(`[Relayer] pUSD wrap confirmed! TX: ${receipt?.hash || wrapTx.hash}`);
        return receipt?.hash || wrapTx.hash;
    }

    /**
     * Withdraw pUSD from the Polymarket deposit wallet to an external address.
     * Uses the RelayClient to execute a gasless batch call from the deposit wallet.
     */
    async withdrawGasless(userWalletIndex: number, recipientAddress: string, amount: bigint): Promise<string> {
        if (this.isDemoMode) {
            console.log(`[Relayer-Demo] Simulating gasless pUSD withdrawal of ${amount} units to ${recipientAddress}`);
            await new Promise(r => setTimeout(r, 1500));
            return "0x_simulated_pusd_withdrawal_tx_hash";
        }

        const client = this.getUserRelayClient(userWalletIndex);
        if (!client) throw new Error("Failed to construct relayer client");

        const depositWallet = await this.resolveDepositWallet(userWalletIndex);

        // Transfer pUSD from deposit wallet to recipient
        const callData = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [recipientAddress as `0x${string}`, amount]
        });

        const withdrawCall = {
            target: PUSD_ADDRESS, // Withdraw pUSD (not old USDC.e)
            value: "0",
            data: callData
        };

        const deadline = Math.floor(Date.now() / 1000 + 3600).toString();

        try {
            console.log(`[Relayer] Submitting gasless pUSD withdrawal from deposit wallet: ${depositWallet} → ${recipientAddress}`);
            const response = await client.executeDepositWalletBatch([withdrawCall], depositWallet, deadline);
            const result = await response.wait();
            return result?.transactionHash || response.transactionHash || response.hash;
        } catch (err: any) {
            console.error("[Relayer] pUSD withdrawal failed:", err.message);
            throw new Error(`Gasless pUSD withdrawal failed: ${err.message}`);
        }
    }
}

export const polymarketRelayerService = new PolymarketRelayerService();

// Re-export key constants for use in other services/API routes
export { PUSD_ADDRESS, USDCE_ADDRESS, COLLATERAL_ONRAMP_ADDRESS };
