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

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon.llamarpc.com";

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
     * Deposit funds into Polymarket using the Bridge API (for multi-chain) or Native Onramp (for Polygon USDC.e).
     */
    async depositGasless(userWalletIndex: number, amount: bigint, chainStr: string = 'polygon', tokenStr: string = 'USDC'): Promise<string> {
        if (this.isDemoMode) {
            console.log(`[Relayer-Demo] Simulating deposit of ${amount} units (${tokenStr} on ${chainStr})`);
            await new Promise(r => setTimeout(r, 1500));
            return "0x_simulated_deposit_tx_hash";
        }

        const derived = walletService.deriveWallet(userWalletIndex);
        const depositWallet = await this.resolveDepositWallet(userWalletIndex);

        // Standardize chain and token names
        const chain = chainStr.toLowerCase().trim();
        const token = tokenStr.toUpperCase().trim();

        // If native Polygon USDC, we can still use the instant onramp to save bridge time
        if (chain === 'polygon' && token === 'USDC') {
            const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
            const signer = new ethers.Wallet(derived.privateKey, provider);
            const usdce = new ethers.Contract(USDCE_ADDRESS, ERC20_ABI as any, signer);
            const onramp = new ethers.Contract(COLLATERAL_ONRAMP_ADDRESS, COLLATERAL_ONRAMP_ABI as any, signer);

            const usdceBalance = await usdce.balanceOf(signer.address);
            if (usdceBalance < amount) {
                throw new Error(`Insufficient USDC balance on Polygon. Have: ${ethers.formatUnits(usdceBalance, 6)}, Need: ${ethers.formatUnits(amount, 6)}`);
            }

            const currentAllowance = await usdce.allowance(signer.address, COLLATERAL_ONRAMP_ADDRESS);
            if (currentAllowance < amount) {
                console.log(`[Relayer] Approving Collateral Onramp...`);
                const approveTx = await usdce.approve(COLLATERAL_ONRAMP_ADDRESS, amount);
                await approveTx.wait();
            }

            console.log(`[Relayer] Wrapping USDC → pUSD via Collateral Onramp...`);
            const wrapTx = await onramp.wrap(amount);
            const receipt = await wrapTx.wait();
            return receipt?.hash || wrapTx.hash;
        }

        // --- Bridge API Flow for Multi-Chain (BSC, etc.) ---
        console.log(`[Relayer] Requesting Bridge deposit address for wallet ${depositWallet}`);

        let bridgeAddress: string;
        try {
            // Step 1: Validate chain+token combo against supported assets
            const supportedRes = await fetch("https://bridge.polymarket.com/supported-assets");
            if (!supportedRes.ok) throw new Error(`Supported assets fetch failed: ${supportedRes.status}`);
            const supported: any = await supportedRes.json();

            // Log full response so we can debug the shape on Railway
            console.log(`[Relayer] Supported assets response:`, JSON.stringify(supported).slice(0, 500));

            // Step 2: Request bridge deposit addresses linked to the user's Polymarket deposit wallet
            const depositRes = await fetch("https://bridge.polymarket.com/deposit", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Builder-Code": (env as any).POLYMARKET_BUILDER_CODE || ""
                },
                // Pass the Polymarket deposit wallet — this is the address that receives pUSD on Polygon
                body: JSON.stringify({ address: depositWallet })
            });

            if (!depositRes.ok) {
                const errText = await depositRes.text();
                throw new Error(`Bridge API ${depositRes.status}: ${errText}`);
            }

            const data: any = await depositRes.json();

            // Log the full raw response so we know the exact shape
            console.log(`[Relayer] Bridge /deposit raw response:`, JSON.stringify(data));

            // Determine address type based on source chain
            // EVM covers: Polygon, BSC, Arbitrum, Base, Ethereum, Optimism
            const isEvm = ['polygon', 'bsc', 'arbitrum', 'base', 'ethereum', 'optimism'].includes(chain);
            const isSvm = chain === 'solana';
            const isBtc = chain === 'bitcoin';
            const isTvm = chain === 'tron';

            if (isEvm) {
                bridgeAddress = data.address?.evm ?? data.evm ?? data.evmAddress;
            } else if (isSvm) {
                bridgeAddress = data.svm ?? data.svmAddress ?? data.addresses?.svm;
            } else if (isBtc) {
                bridgeAddress = data.btc ?? data.btcAddress ?? data.addresses?.btc;
            } else if (isTvm) {
                bridgeAddress = data.tvm ?? data.tvmAddress ?? data.addresses?.tvm;
            } else {
                throw new Error(`Unsupported chain: ${chain}`);
            }

            if (!bridgeAddress) {
                throw new Error(`Bridge API response missing ${isEvm ? 'evm' : chain} address. Full response: ${JSON.stringify(data)}`);
            }

            // EVM address validation
            if (isEvm && !ethers.isAddress(bridgeAddress)) {
                throw new Error(`Bridge returned invalid EVM address: ${bridgeAddress}`);
            }

            console.log(`[Relayer] Bridge address obtained (${chain}): ${bridgeAddress}`);
        } catch (e: any) {
            console.error(`[Relayer] Bridge API failure:`, e.message);
            throw new Error(`Polymarket Bridge API error: ${e.message}`);
        }

        // Configure RPC and Token Address based on the source chain
        let rpcUrl = POLYGON_RPC;
        let tokenAddr = USDCE_ADDRESS;
        let decimals = 6;

        if (chain === 'bsc') {
            rpcUrl = "https://bsc-dataseed.binance.org";
            if (token === 'USDC') {
                tokenAddr = "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d";
                decimals = 18;
            } else if (token === 'USDT') {
                tokenAddr = "0x55d398326f99059fF775485246999027B3197955";
                decimals = 18; // BSC USDT uses 18 decimals
            }
        } else if (chain === 'polygon' && token === 'USDT') {
            tokenAddr = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
            decimals = 6;
        }

        // Adjust amount for decimals if it differs from the default 6
        let actualAmount = amount;
        if (decimals === 18) {
            // The input amount is assuming 6 decimals (from miniapp.ts BigInt math)
            // Multiply by 10^12 to scale 6 decimals to 18 decimals
            actualAmount = amount * 1_000_000_000_000n;
        }

        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const signer = new ethers.Wallet(derived.privateKey, provider);
        const sourceToken = new ethers.Contract(tokenAddr, ERC20_ABI as any, signer);

        // Check user balance on source chain
        const balance = await sourceToken.balanceOf(signer.address);
        if (balance < actualAmount) {
            throw new Error(`Insufficient ${token} balance on ${chain.toUpperCase()}. Have: ${ethers.formatUnits(balance, decimals)}, Need: ${ethers.formatUnits(actualAmount, decimals)}`);
        }

        // Execute ERC20 Transfer to the Polymarket Bridge Address
        console.log(`[Relayer] Transferring ${ethers.formatUnits(actualAmount, decimals)} ${token} on ${chain} to Bridge Address ${bridgeAddress}...`);
        const tx = await sourceToken.transfer(bridgeAddress, actualAmount);
        const receipt = await tx.wait();
        
        console.log(`[Relayer] Bridge Transfer confirmed! TX: ${receipt?.hash || tx.hash}`);
        return receipt?.hash || tx.hash;
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
