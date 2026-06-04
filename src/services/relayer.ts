import { RelayClient } from "@polymarket/builder-relayer-client";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ethers } from "ethers";
import axios from "axios";
import { wallet as walletService } from "./wallet";
import { env } from "../config/env";
import WebSocket from "ws";
import { db } from "../db/client";

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
    inputs: [
      { name: "_asset", type: "address" },
      { name: "_to", type: "address" },
      { name: "_amount", type: "uint256" }
    ],
    outputs: []
  }
] as const;

/**
 * Conditional Tokens Framework (CTF) ABI
 * Used to redeem winning positions for collateral.
 */
const CTF_ABI = [
  {
    name: "redeemPositions",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "parentCollectionId", type: "bytes32" },
      { name: "conditionId", type: "bytes32" },
      { name: "indexSets", type: "uint256[]" }
    ],
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
                key: (env as any).POLYMARKET_BUILDER_API_KEY || "",
                secret: (env as any).POLYMARKET_BUILDER_SECRET || "",
                passphrase: (env as any).POLYMARKET_BUILDER_PASSPHRASE || ""
            };

            const builderConfig = new BuilderConfig({
                localBuilderCreds: creds
            });

            const relayerUrl = process.env.RELAYER_URL || "https://relayer-v2.polymarket.com";
            
            return new RelayClient(
                relayerUrl,
                137, // Polygon chain ID
                wallet,
                builderConfig
            );
        } catch (e) {
            console.error("Failed to create RelayClient:", e);
            return null;
        }
    }

    /**
     * Resolves the deterministic deposit wallet (proxy wallet) address for a user.
     * This address is determined entirely by the user's EOA signer.
     */
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
            throw err;
        }
    }

    /**
     * Deploys the deposit wallet for the given user natively using the Relayer API.
     * This is required before the user can create an API key or place a trade.
     */
    async deployDepositWallet(userWalletIndex: number): Promise<void> {
        try {
            const client = this.getUserRelayClient(userWalletIndex);
            if (!client) {
                throw new Error("Could not instantiate RelayClient");
            }
            
            console.log(`[Relayer] Calling relayer.deployDepositWallet() for user ${userWalletIndex}...`);
            const tx = await client.deployDepositWallet();
            await tx.wait();
            console.log(`[Relayer] Successfully deployed deposit wallet for user ${userWalletIndex}!`);
        } catch (e: any) {
            console.error(`[Relayer] Failed to deploy deposit wallet:`, e.message || e);
            throw new Error(`Failed to deploy deposit wallet: ${e.message}`);
        }
    }
    /**
     * Approves the CTF Exchange to spend the proxy wallet's collateral tokens
     */
    async approveExchange(userWalletIndex: number): Promise<void> {
        try {
            const client = this.getUserRelayClient(userWalletIndex);
            if (!client) throw new Error("Could not instantiate RelayClient");

            const depositWallet = await this.resolveDepositWallet(userWalletIndex);
            const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
            
            // The CTF Exchange V2 spender from the error log
            const CTF_EXCHANGE_V2 = "0xE111180000d2663C0091e4f400237545B87B996B";
            
            const NATIVE_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
            
            const tokensToApprove = [
                USDCE_ADDRESS,
                NATIVE_USDC,
                PUSD_ADDRESS
            ];

            const calls: any[] = [];
            
            for (const tokenAddr of tokensToApprove) {
                const tokenContract = new ethers.Contract(tokenAddr, ERC20_ABI as any, provider);
                const allowance = await tokenContract.allowance(depositWallet, CTF_EXCHANGE_V2);
                
                if (allowance < ethers.parseUnits("100", 6)) {
                    const tx = await tokenContract.approve.populateTransaction(CTF_EXCHANGE_V2, ethers.MaxUint256);
                    calls.push({
                        target: tokenAddr,
                        value: "0",
                        data: tx.data
                    });
                }
            }

            if (calls.length === 0) {
                return; // Everything already approved
            }

            console.log(`[Relayer] Approving ${calls.length} tokens for CTF Exchange via relayer batch...`);
            const deadline = Math.floor(Date.now() / 1000) + 600;
            const batchTx = await client.executeDepositWalletBatch(calls, depositWallet, deadline.toString());
            await batchTx.wait();
            console.log(`[Relayer] Successfully approved tokens for CTF Exchange!`);
        } catch (e: any) {
            console.error("[Relayer] Failed to approve CTF exchange:", e.message);
            throw e;
        }
    }

    async redeemPositions(userWalletIndex: number, conditionId: string, indexSet: number): Promise<string> {
        if (this.isDemoMode) {
            console.log(`[Relayer] DEMO MODE: Skipping auto-redeem for ${conditionId}`);
            return "demo-tx-hash";
        }

        const client = this.getUserRelayClient(userWalletIndex);
        if (!client) throw new Error("Could not instantiate RelayClient");
        
        try {
            console.log(`[Relayer] Redeeming positions for condition ${conditionId}...`);

            // 1. Determine if market is NegRisk or Standard
            let isNegRisk = false;
            try {
                const marketRes = await axios.get(`https://gamma-api.polymarket.com/markets`, {
                    params: { conditionId },
                    timeout: 5000
                });
                isNegRisk = !!marketRes.data?.[0]?.negRisk;
            } catch (err: any) {
                console.warn(`[Relayer] Failed to check negRisk via Gamma: ${err.message}. Defaulting to false.`);
            }

            const CTF_ADAPTER = isNegRisk 
                ? "0xadA2005600Dec949baf300f4C6120000bDB6eAab"  // NegRiskCtfCollateralAdapter
                : "0xAdA100Db00Ca00073811820692005400218FcE1f"; // CtfCollateralAdapter

            console.log(`[Relayer] Using CTF Adapter: ${CTF_ADAPTER} (isNegRisk: ${isNegRisk})`);

            const depositWallet = await this.resolveDepositWallet(userWalletIndex);

            // 2. Query ConditionalTokens contract to check resolution and payout numerators
            const CTF_CONTRACT_ADDRESS = ethers.getAddress("0x4d97dcd97ec945f40cf65f87097ace5ea0476045");
            const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
            
            const ctfContract = new ethers.Contract(CTF_CONTRACT_ADDRESS, [
                "function payoutDenominator(bytes32) view returns (uint256)",
                "function payoutNumerators(bytes32, uint256) view returns (uint256)",
                "function balanceOf(address, uint256) view returns (uint256)"
            ], provider);

            const denominator = await ctfContract.payoutDenominator(conditionId);
            if (denominator === 0n) {
                throw new Error(`Market condition ${conditionId} is not resolved on-chain yet (payout denominator is 0).`);
            }

            // Verify that the requested indexSet is a winner (payoutNumerator > 0)
            const payoutIndex = indexSet === 1 ? 0n : 1n;
            const payoutNum = await ctfContract.payoutNumerators(conditionId, payoutIndex);
            if (payoutNum === 0n) {
                throw new Error(`Requested indexSet ${indexSet} is not a winning outcome for condition ${conditionId} (payout is 0).`);
            }

            // Calculate exact ERC-1155 tokenId for Gnosis Conditional Tokens position
            const parentCollectionId = "0x0000000000000000000000000000000000000000000000000000000000000000";
            const collectionId = ethers.solidityPackedKeccak256(
                ["bytes32", "bytes32", "uint256"],
                [parentCollectionId, conditionId, BigInt(indexSet)]
            );
            const tokenId = BigInt(ethers.solidityPackedKeccak256(
                ["address", "bytes32"],
                [PUSD_ADDRESS, collectionId]
            ));

            const balance = await ctfContract.balanceOf(depositWallet, tokenId);
            if (balance === 0n) {
                console.log(`[Relayer] Skipping condition ${conditionId} for indexSet ${indexSet} — zero balance, already redeemed.`);
                return "skipped-zero-balance";
            }

            console.log(`[Relayer] Redeeming indexSet [${indexSet}] for condition ${conditionId}`);

            const encodedData = encodeFunctionData({
                abi: [{
                    name: "redeemPositions",
                    type: "function",
                    inputs: [
                        { name: "collateralToken", type: "address" },
                        { name: "parentCollectionId", type: "bytes32" },
                        { name: "conditionId", type: "bytes32" },
                        { name: "indexSets", type: "uint256[]" }
                    ],
                    outputs: []
                }],
                functionName: "redeemPositions",
                args: [
                    PUSD_ADDRESS, 
                    "0x0000000000000000000000000000000000000000000000000000000000000000", 
                    conditionId as `0x${string}`,
                    [BigInt(indexSet)]
                ]
            });

            // depositWallet is already resolved at the top of redeemPositions
            
            const calls = [{
                target: CTF_ADAPTER,
                value: "0",
                data: encodedData
            }];
            
            const deadline = Math.floor(Date.now() / 1000) + 600;
            const tx = await client.executeDepositWalletBatch(calls, depositWallet, deadline.toString());
            await tx.wait();
            console.log(`[Relayer] Successfully redeemed condition ${conditionId}!`);
            return tx.hash;
        } catch (e: any) {
            console.error(`[Relayer] Failed to redeem positions for ${conditionId}:`, e.message);
            throw e;
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
    async depositGasless(userWalletIndex: number, amount: bigint, chainStr: string = 'polygon', tokenStr: string = 'USDC'): Promise<{txHash: string, bridgeAddress?: string}> {
        if (this.isDemoMode) {
            console.log(`[Relayer-Demo] Simulating deposit of ${amount} units (${tokenStr} on ${chainStr})`);
            await new Promise(r => setTimeout(r, 1500));
            return { txHash: "0x_simulated_deposit_tx_hash" };
        }

        const derived = walletService.deriveWallet(userWalletIndex);
        const depositWallet = await this.resolveDepositWallet(userWalletIndex);

        // Standardize chain and token names
        const chain = chainStr.toLowerCase().trim();
        const token = tokenStr.toUpperCase().trim();

        // If native Polygon USDC, we can still use the instant onramp to save bridge time
        if (chain === 'polygon' && token === 'USDC') {
            const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
            const usdce = new ethers.Contract(USDCE_ADDRESS, ERC20_ABI as any, provider);

            const usdceBalance = await usdce.balanceOf(depositWallet);
            if (usdceBalance < amount) {
                throw new Error(`Insufficient USDC balance in proxy on Polygon. Have: ${ethers.formatUnits(usdceBalance, 6)}, Need: ${ethers.formatUnits(amount, 6)}`);
            }

            const client = this.getUserRelayClient(userWalletIndex);
            if (!client) throw new Error("Failed to construct relayer client");

            const approveData = encodeFunctionData({
                abi: ERC20_ABI,
                functionName: "approve",
                args: [COLLATERAL_ONRAMP_ADDRESS, amount]
            });

            const wrapData = encodeFunctionData({
                abi: COLLATERAL_ONRAMP_ABI,
                functionName: "wrap",
                args: [USDCE_ADDRESS, depositWallet as `0x${string}`, amount]
            });

            const approveCall = {
                target: USDCE_ADDRESS,
                value: "0",
                data: approveData
            };

            const wrapCall = {
                target: COLLATERAL_ONRAMP_ADDRESS,
                value: "0",
                data: wrapData
            };

            const deadline = Math.floor(Date.now() / 1000 + 3600).toString();

            console.log(`[Relayer] Wrapping USDC → pUSD via proxy ${depositWallet}...`);
            const response = await client.executeDepositWalletBatch([approveCall, wrapCall], depositWallet, deadline);
            const receipt = await response.wait();
            return { txHash: receipt?.transactionHash || response.transactionHash || response.hash };
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
        return { txHash: receipt?.hash || tx.hash, bridgeAddress };
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

    /**
     * Withdraw pUSD cross-chain using Relay SDK and Polymarket Biconomy Relayer natively.
     */
    async withdrawCrossChain(userWalletIndex: number, destChainId: number, destCurrencyAddress: string, recipientAddress: string, amount: bigint): Promise<string> {
        throw new Error("Cross-chain withdrawals require native gas and are currently disabled. Please use Polygon pUSD withdrawals.");
    }
}

export const polymarketRelayerService = new PolymarketRelayerService();

// Re-export key constants for use in other services/API routes
export { PUSD_ADDRESS, USDCE_ADDRESS, COLLATERAL_ONRAMP_ADDRESS };

