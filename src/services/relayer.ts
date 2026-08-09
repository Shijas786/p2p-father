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

export const SUPPORTED_NETWORKS: Record<string, { name: string, token: string }> = {
    "137":   { name: "Polygon",  token: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" }, // USDC.e
    "1":     { name: "Ethereum", token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" }, // USDC
    "56":    { name: "BSC",      token: "0x55d398326f99059fF775485246999027B3197955" }, // USDT
    "42161": { name: "Arbitrum", token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" }, // USDC
};

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";

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
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
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
    private hasCredentials = false;

    constructor() {
        this.hasCredentials = !!((env as any).POLYMARKET_PRIVATE_KEY &&
                                 (env as any).POLYMARKET_BUILDER_API_KEY &&
                                 (env as any).POLYMARKET_BUILDER_SECRET &&
                                 (env as any).POLYMARKET_BUILDER_PASSPHRASE);

        if (!this.hasCredentials) {
            console.error("❌ CRITICAL: Polymarket Builder credentials missing from environment variables. Predictions functionality will throw errors.");
        }
    }

    private checkCredentials() {
        if (!this.hasCredentials) {
            throw new Error("Polymarket operations are disabled: Builder credentials are not configured.");
        }
    }

    /**
     * Helper to construct a RelayClient authenticated specifically for a user EOA
     */
    private getUserRelayClient(userWalletIndex: number): RelayClient | null {
        this.checkCredentials();

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
     * Caches the result in Supabase after first derivation so mobile clients never wait.
     */
    async resolveDepositWallet(userWalletIndex: number, cachedAddress?: string | null): Promise<string> {
        // Return cached address immediately if available — avoids slow relayer call
        if (cachedAddress && cachedAddress !== '') {
            return cachedAddress;
        }

        this.checkCredentials();
        try {
            const client = this.getUserRelayClient(userWalletIndex);
            if (!client) throw new Error("Failed to construct relayer client");
            const address = await client.deriveDepositWalletAddress();

            // Persist to DB so future calls are instant
            try {
                const { db } = await import("../db/client");
                const supabase = (db as any).getClient();
                await supabase.from("users")
                    .update({ deposit_wallet_address: address })
                    .eq("wallet_index", userWalletIndex);
            } catch (dbErr: any) {
                console.warn("[Relayer] Failed to cache deposit wallet in DB:", dbErr.message);
            }

            return address;
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
            const provider = new ethers.JsonRpcProvider(POLYGON_RPC, 137, { staticNetwork: true });
            
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

    /**
     * Approves the CTF Exchange to spend the proxy wallet's ERC1155 conditional tokens (needed for SELL orders).
     */
    async approveConditionalTokens(userWalletIndex: number): Promise<void> {
        try {
            const client = this.getUserRelayClient(userWalletIndex);
            if (!client) throw new Error("Could not instantiate RelayClient");

            const depositWallet = await this.resolveDepositWallet(userWalletIndex);
            const provider = new ethers.JsonRpcProvider(POLYGON_RPC, 137, { staticNetwork: true });
            
            const CTF_EXCHANGE_V2 = "0xE111180000d2663C0091e4f400237545B87B996B";
            const CONDITIONAL_TOKENS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
            
            const erc1155Abi = [
                "function isApprovedForAll(address owner, address operator) view returns (bool)",
                "function setApprovalForAll(address operator, bool approved)"
            ];
            const tokenContract = new ethers.Contract(CONDITIONAL_TOKENS, erc1155Abi, provider);
            
            const isApproved = await tokenContract.isApprovedForAll(depositWallet, CTF_EXCHANGE_V2);
            if (isApproved) {
                return; // Already approved
            }

            console.log(`[Relayer] Approving ERC1155 Conditional Tokens for CTF Exchange...`);
            const tx = await tokenContract.setApprovalForAll.populateTransaction(CTF_EXCHANGE_V2, true);
            
            const deadline = Math.floor(Date.now() / 1000) + 600;
            const batchTx = await client.executeDepositWalletBatch([{
                target: CONDITIONAL_TOKENS,
                value: "0",
                data: tx.data
            }], depositWallet, deadline.toString());
            
            await batchTx.wait();
            console.log(`[Relayer] Successfully approved ERC1155 tokens!`);
        } catch (e: any) {
            console.error("[Relayer] Failed to approve ERC1155 tokens:", e.message);
            throw e;
        }
    }

    async redeemPositions(userWalletIndex: number, conditionId: string, indexSet: number): Promise<string> {
        this.checkCredentials();

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

            let CTF_ADAPTER = isNegRisk 
                ? "0xadA2005600Dec949baf300f4C6120000bDB6eAab"  // NegRiskCtfCollateralAdapter
                : "0xAdA100Db00Ca00073811820692005400218FcE1f"; // CtfCollateralAdapter

            console.log(`[Relayer] Using CTF Adapter: ${CTF_ADAPTER} (isNegRisk: ${isNegRisk})`);

            const depositWallet = await this.resolveDepositWallet(userWalletIndex);

            // 2. Query ConditionalTokens contract to check resolution and payout numerators
            const CTF_CONTRACT_ADDRESS = ethers.getAddress("0x4d97dcd97ec945f40cf65f87097ace5ea0476045");
            const provider = new ethers.JsonRpcProvider(POLYGON_RPC, 137, { staticNetwork: true });
            
            const ctfContract = new ethers.Contract(CTF_CONTRACT_ADDRESS, [
                "function payoutDenominator(bytes32) view returns (uint256)",
                "function payoutNumerators(bytes32, uint256) view returns (uint256)",
                "function balanceOf(address, uint256) view returns (uint256)",
                "function isApprovedForAll(address, address) view returns (bool)",
                "function setApprovalForAll(address, bool)",
                "function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)",
                "function getPositionId(address collateralToken, bytes32 collectionId) view returns (uint256)"
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

            // Calculate collectionId and tokenIds on-chain dynamically to avoid local packing bugs
            const parentCollectionId = "0x0000000000000000000000000000000000000000000000000000000000000000";
            const collectionId = await ctfContract.getCollectionId(parentCollectionId, conditionId, BigInt(indexSet));
            
            const tokenIdPUSD = await ctfContract.getPositionId(PUSD_ADDRESS, collectionId);
            const tokenIdUSDCE = await ctfContract.getPositionId(USDCE_ADDRESS, collectionId);

            const balPUSD = await ctfContract.balanceOf(depositWallet, tokenIdPUSD);
            const balUSDCE = await ctfContract.balanceOf(depositWallet, tokenIdUSDCE);
            
            let collateralToken = PUSD_ADDRESS;
            let balance = 0n;

            if (balPUSD > 0n) {
                collateralToken = PUSD_ADDRESS;
                balance = balPUSD;
            } else if (balUSDCE > 0n) {
                collateralToken = USDCE_ADDRESS;
                balance = balUSDCE;
            }

            if (balance === 0n) {
                console.log(`[Relayer] Skipping condition ${conditionId} for indexSet ${indexSet} — zero balance, already redeemed or user holds the losing outcome.`);
                return "skipped-zero-balance";
            }

            console.log(`[Relayer] Redeeming indexSet [${indexSet}] for condition ${conditionId} using collateral ${collateralToken} (balance: ${ethers.formatUnits(balance, 6)}) and adapter ${CTF_ADAPTER}`);

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
                    collateralToken as `0x${string}`, 
                    "0x0000000000000000000000000000000000000000000000000000000000000000", 
                    conditionId as `0x${string}`,
                    [BigInt(indexSet)]
                ]
            });

            const isApproved = await ctfContract.isApprovedForAll(depositWallet, CTF_ADAPTER);
            if (!isApproved) {
                console.log(`[Relayer] Approving CTF Adapter (${CTF_ADAPTER}) on CTF contract first...`);
                const approveTx = await ctfContract.setApprovalForAll.populateTransaction(CTF_ADAPTER, true);
                const deadline = Math.floor(Date.now() / 1000) + 600;
                const tx = await client.executeDepositWalletBatch([{
                    target: CTF_CONTRACT_ADDRESS,
                    value: "0",
                    data: approveTx.data
                }], depositWallet, deadline.toString());
                await tx.wait();
                console.log(`[Relayer] Approved CTF Adapter (${CTF_ADAPTER}) successfully. Waiting for next cycle to redeem.`);
                throw new Error(`Approval transaction submitted (${tx.hash}). Redeeming will resume in the next cycle.`);
            }

            console.log(`[Relayer] Submitting gasless redemption call for condition ${conditionId}...`);
            const deadline = Math.floor(Date.now() / 1000) + 600;
            const tx = await client.executeDepositWalletBatch([{
                target: CTF_ADAPTER,
                value: "0",
                data: encodedData
            }], depositWallet, deadline.toString());
            
            console.log("[Relayer] Raw response:", JSON.stringify(tx));
            const result = await tx.wait();
            console.log("[Relayer] Wait result:", JSON.stringify(result));
            
            console.log(`[Relayer] Successfully redeemed condition ${conditionId}!`);
            return result?.transactionHash || tx.transactionHash || tx.hash;
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
            const provider = new ethers.JsonRpcProvider(POLYGON_RPC, 137, { staticNetwork: true });
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
        this.checkCredentials();

        const derived = walletService.deriveWallet(userWalletIndex);
        const depositWallet = await this.resolveDepositWallet(userWalletIndex);

        // Standardize chain and token names
        const chain = chainStr.toLowerCase().trim();
        const token = tokenStr.toUpperCase().trim();

        // If native Polygon pUSD, just transfer directly to the deposit wallet (proxy)
        if (chain === 'polygon' && token === 'PUSD') {
            const provider = new ethers.JsonRpcProvider(POLYGON_RPC, 137, { staticNetwork: true });
            const pusdAddress = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
            const signer = new ethers.Wallet(derived.privateKey, provider);
            const pusdContract = new ethers.Contract(pusdAddress, ERC20_ABI as any, signer);
            
            const hotBal = await pusdContract.balanceOf(signer.address);
            if (hotBal < amount) {
                throw new Error(`Insufficient PUSD balance on POLYGON. Have: ${ethers.formatUnits(hotBal, 6)}, Need: ${ethers.formatUnits(amount, 6)}`);
            }
            
            console.log(`[Relayer] Transferring ${ethers.formatUnits(amount, 6)} pUSD directly to Polymarket Proxy ${depositWallet}...`);
            const tx = await pusdContract.transfer(depositWallet, amount);
            const receipt = await tx.wait();
            return { txHash: receipt?.hash || tx.hash };
        }

        // If native Polygon USDC, we can still use the instant onramp to save bridge time
        if (chain === 'polygon' && token === 'USDC') {
            const provider = new ethers.JsonRpcProvider(POLYGON_RPC, 137, { staticNetwork: true });
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
                    "Content-Type": "application/json"
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

        if (chain === 'bsc') {
            rpcUrl = "https://bsc-dataseed.binance.org";
            if (token === 'USDC') {
                tokenAddr = "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d";
            } else if (token === 'USDT') {
                tokenAddr = "0x55d398326f99059fF775485246999027B3197955";
            }
        } else if (chain === 'base') {
            rpcUrl = env.BASE_RPC_URL;
            if (token === 'USDC') {
                tokenAddr = env.USDC_ADDRESS; // 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
            } else {
                throw new Error('Only USDC is supported for Base chain deposits. Please use USDC or switch to a different chain for USDT.');
            }
        } else if (chain === 'polygon' && token === 'USDT') {
            tokenAddr = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
        } else if (chain === 'arbitrum') {
            rpcUrl = "https://arb1.arbitrum.io/rpc";
            if (token === 'USDC') {
                tokenAddr = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
            } else if (token === 'USDT') {
                tokenAddr = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";
            }
        } else if (chain === 'ethereum') {
            rpcUrl = "https://eth.llamarpc.com";
            if (token === 'USDC') {
                tokenAddr = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
            } else if (token === 'USDT') {
                tokenAddr = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
            }
        } else if (chain === 'optimism') {
            rpcUrl = "https://mainnet.optimism.io";
            if (token === 'USDC') {
                tokenAddr = "0x0b2C639c4761c1372b651427b193C79dADA6f271";
            } else if (token === 'USDT') {
                tokenAddr = "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58";
            }
        } else {
            throw new Error(`Unsupported chain for gasless deposit: ${chain}`);
        }

        const chainIdMap: Record<string, number> = { bsc: 56, base: 8453, polygon: 137, arbitrum: 42161, ethereum: 1, optimism: 10 };
        const provider = new ethers.JsonRpcProvider(rpcUrl, chainIdMap[chain] || 137, { staticNetwork: true });
        const signer = new ethers.Wallet(derived.privateKey, provider);
        const sourceToken = new ethers.Contract(tokenAddr, ERC20_ABI as any, signer);

        // Fetch decimals dynamically from token contract
        const decimals = Number(await sourceToken.decimals());

        // Adjust amount for decimals if it differs from the default 6 (input is always 6 decimals)
        let actualAmount = amount;
        if (decimals > 6) {
            actualAmount = amount * (10n ** BigInt(decimals - 6));
        } else if (decimals < 6) {
            actualAmount = amount / (10n ** BigInt(6 - decimals));
        }

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
        this.checkCredentials();

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
            
            console.log("[Relayer] Withdraw raw response:", JSON.stringify(response));
            const result = await response.wait();
            console.log("[Relayer] Withdraw wait result:", JSON.stringify(result));
            
            return result?.transactionHash || response.transactionHash || response.hash;
        } catch (err: any) {
            console.error("[Relayer] pUSD withdrawal failed:", err.message);
            throw new Error(`Gasless pUSD withdrawal failed: ${err.message}`);
        }
    }

    /**
     * Get a cross-chain withdrawal quote from the Polymarket Bridge API.
     */
    async getCrossChainWithdrawalQuote(amount: number, toChainId: string, toTokenAddress: string, recipientAddr: string) {
        if (toChainId === "137") {
            // Polygon doesn't need bridge, estimate is exactly the amount (no bridge fee)
            return { estimatedOutput: amount.toString() };
        }
        
        try {
            const { data } = await axios.post("https://bridge.polymarket.com/quote", {
                fromAmountBaseUnit: Math.floor(amount * 1e6).toString(),
                fromChainId: "137", // always Polygon
                fromTokenAddress: PUSD_ADDRESS,
                toChainId,
                toTokenAddress,
                recipientAddress: recipientAddr
            });
            return { quote: data };
        } catch (err: any) {
            console.error("[Relayer] Failed to fetch cross-chain quote:", err.response?.data || err.message);
            throw new Error(err.response?.data?.message || "Failed to fetch bridge quote");
        }
    }

    /**
     * Withdraw pUSD cross-chain using Polymarket Bridge API and Relayer natively.
     */
    async withdrawCrossChain(userWalletIndex: number, destChainId: string, destCurrencyAddress: string, recipientAddress: string, amount: bigint): Promise<string> {
        this.checkCredentials();

        const depositWallet = await this.resolveDepositWallet(userWalletIndex);

        console.log(`[Relayer] Initiating cross-chain withdraw for ${depositWallet} -> ${recipientAddress} (Chain ${destChainId})`);

        // Step 1 - Generate bridge address
        let bridgeAddress: string;
        try {
            const { data } = await axios.post("https://bridge.polymarket.com/withdraw", {
                address: depositWallet,
                toChainId: destChainId,
                toTokenAddress: destCurrencyAddress,
                recipientAddr: recipientAddress
            });
            bridgeAddress = data.address.evm;
        } catch (err: any) {
            console.error("[Relayer] Failed to generate bridge address:", err.response?.data || err.message);
            throw new Error(err.response?.data?.message || "Failed to initialize bridge withdrawal");
        }

        console.log(`[Relayer] Polymarket Bridge generated address: ${bridgeAddress}`);

        const client = this.getUserRelayClient(userWalletIndex);
        if (!client) throw new Error("Failed to construct relayer client");

        // Step 2 - Transfer pUSD from deposit wallet to bridge address (gasless via relayer)
        const callData = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [bridgeAddress as `0x${string}`, amount]
        });

        const withdrawCall = {
            target: PUSD_ADDRESS, 
            value: "0",
            data: callData
        };

        const deadline = Math.floor(Date.now() / 1000 + 3600).toString();

        try {
            console.log(`[Relayer] Submitting gasless transfer to bridge: ${bridgeAddress}`);
            const response = await client.executeDepositWalletBatch([withdrawCall], depositWallet, deadline);
            
            console.log("[Relayer] Bridge transfer raw response:", JSON.stringify(response));
            const result = await response.wait();
            console.log("[Relayer] Bridge transfer wait result:", JSON.stringify(result));
            
            return bridgeAddress; // Return bridge address so we can poll status
        } catch (err: any) {
            console.error("[Relayer] Bridge transfer failed:", err.message);
            throw new Error(`Gasless transfer to bridge failed: ${err.message}`);
        }
    }
}

export const polymarketRelayerService = new PolymarketRelayerService();

// Re-export key constants for use in other services/API routes
export { PUSD_ADDRESS, USDCE_ADDRESS, COLLATERAL_ONRAMP_ADDRESS };

