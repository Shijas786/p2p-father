import {
    createWalletClient,
    createPublicClient,
    defineSchema,
    addr,
    str,
    dec,
    u64,
    bool,
    ExpirationTime
} from "@arkiv-network/sdk";
import { eq } from "@arkiv-network/sdk/query";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "../config/env";

/**
 * 1. Define Public Schemas on Arkiv DB-Chain
 */
export const TraderReputationSchema = defineSchema("p2pfather.trader_reputation", {
    traderAddress: addr().indexed(),
    riskLevel: str().indexed(),       // "LOW", "MEDIUM", "HIGH", "BLOCKED"
    completedTrades: u64().indexed(), // Total completed trades
    disputeCount: u64(),              // Count of lost/opened disputes
    trustScore: dec().indexed(),      // e.g. "98.5"
    isVerified: bool().indexed(),     // Whether trader passed KYC / proof of humanity
    lastTradeAt: str(),
});

export const FraudBlacklistSchema = defineSchema("p2pfather.fraud_blacklist", {
    flaggedAddress: addr().indexed(),
    reason: str(),                    // e.g. "Third-party UPI scam / Bank freeze complaint"
    source: str().indexed(),          // "CYBER_CELL", "CHARGEBACK_FRAUD", "DISPUTE_LOSS"
    severity: str().indexed(),        // "HIGH", "CRITICAL"
    flaggedAt: str(),
});

/**
 * 2. Initialize Arkiv Clients
 */
const accessKey = env.ARKIV_ACCESS_KEY || process.env.ARKIV_ACCESS_KEY || "";
const chain = rabdi({ accessKey });

// Public client for open queries
export const arkivReader = createPublicClient({
    chain,
    transport: http()
});

// Wallet client for on-chain writes/mirrors (optional fallback to relayer)
const privateKey = (env.ARKIV_PRIVATE_KEY || env.RELAYER_PRIVATE_KEY || process.env.ARKIV_PRIVATE_KEY || process.env.RELAYER_PRIVATE_KEY) as Hex | undefined;

let arkivWriter: any = null;
if (privateKey && privateKey.startsWith("0x") && privateKey.length === 66) {
    try {
        const account = privateKeyToAccount(privateKey);
        arkivWriter = createWalletClient({
            chain,
            transport: http(),
            account
        });
    } catch (e: any) {
        console.warn(`[Arkiv] Could not initialize wallet client: ${e.message}`);
    }
}

/**
 * Arkiv Service — Decentralized P2P Reputation & Fraud Blacklist Layer
 */
export class ArkivService {
    /**
     * Fetch a trader's on-chain reputation from Arkiv
     */
    static async getTraderReputation(walletAddress: string) {
        if (!accessKey) return null;
        try {
            const normalizedAddr = walletAddress.toLowerCase() as `0x${string}`;
            const queryClient = arkivReader as any;
            const result = await queryClient
                .select({
                    $key: true,
                    traderAddress: true,
                    riskLevel: true,
                    completedTrades: true,
                    disputeCount: true,
                    trustScore: true,
                    isVerified: true,
                    lastTradeAt: true
                })
                .from(TraderReputationSchema)
                .where((eq as any)("traderAddress", addr(normalizedAddr)))
                .limit(1)
                .fetch();

            if (result && result.entities && result.entities.length > 0) {
                const entity = result.entities[0];
                return {
                    key: entity.$key,
                    traderAddress: String(entity.traderAddress?.value || normalizedAddr),
                    riskLevel: String(entity.riskLevel?.value || "LOW"),
                    completedTrades: Number(entity.completedTrades?.value || 0),
                    disputeCount: Number(entity.disputeCount?.value || 0),
                    trustScore: String(entity.trustScore?.value || "100.0"),
                    isVerified: Boolean(entity.isVerified?.value || false),
                    lastTradeAt: String(entity.lastTradeAt?.value || "")
                };
            }
            return null;
        } catch (err: any) {
            console.warn(`[Arkiv] Error reading reputation for ${walletAddress}:`, err.message);
            return null;
        }
    }

    /**
     * Check if a counterparty wallet is flagged on the public Arkiv Blacklist
     */
    static async checkBlacklist(walletAddress: string): Promise<{ isBlacklisted: boolean; reason?: string; severity?: string } | null> {
        if (!accessKey) return null;
        try {
            const normalizedAddr = walletAddress.toLowerCase() as `0x${string}`;
            const queryClient = arkivReader as any;
            const result = await queryClient
                .select({
                    $key: true,
                    flaggedAddress: true,
                    reason: true,
                    source: true,
                    severity: true
                })
                .from(FraudBlacklistSchema)
                .where((eq as any)("flaggedAddress", addr(normalizedAddr)))
                .limit(1)
                .fetch();

            if (result && result.entities && result.entities.length > 0) {
                const entity = result.entities[0];
                return {
                    isBlacklisted: true,
                    reason: String(entity.reason?.value || "Reported bad actor"),
                    severity: String(entity.severity?.value || "HIGH")
                };
            }
            return { isBlacklisted: false };
        } catch (err: any) {
            console.warn(`[Arkiv] Error checking blacklist for ${walletAddress}:`, err.message);
            return null;
        }
    }

    /**
     * Mirror or update a trader's reputation to Arkiv
     */
    static async mirrorTrader(params: {
        address: string;
        riskLevel?: "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";
        completedTrades: number;
        disputeCount?: number;
        trustScore?: string;
        isVerified?: boolean;
    }): Promise<{ success: boolean; entityKey?: string; txHash?: string; error?: string }> {
        if (!arkivWriter) {
            return { success: false, error: "Arkiv wallet client not initialized (missing private key or gas)" };
        }

        try {
            const normalizedAddr = params.address.toLowerCase() as `0x${string}`;
            const riskLevel = params.riskLevel || (params.completedTrades > 50 ? "LOW" : "MEDIUM");
            const disputeCount = params.disputeCount || 0;
            const trustScore = params.trustScore || "98.0";
            const isVerified = params.isVerified ?? false;

            const { entityKey, txHash } = await arkivWriter.createEntity(
                TraderReputationSchema as any,
                {
                    traderAddress: addr(normalizedAddr),
                    riskLevel,
                    completedTrades: u64(params.completedTrades),
                    disputeCount: u64(disputeCount),
                    trustScore: dec(trustScore),
                    isVerified,
                    lastTradeAt: new Date().toISOString()
                },
                {
                    expiration: ExpirationTime.fromDays(90) // 90 days validity
                }
            );

            console.log(`[Arkiv] Successfully mirrored trader ${normalizedAddr} (key: ${entityKey}, tx: ${txHash})`);
            return { success: true, entityKey, txHash };
        } catch (err: any) {
            console.warn(`[Arkiv] Error mirroring trader: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    /**
     * Publish a confirmed scammer address to the open Arkiv Fraud Blacklist
     */
    static async flagScammer(params: {
        address: string;
        reason: string;
        source?: "CYBER_CELL" | "CHARGEBACK_FRAUD" | "DISPUTE_LOSS" | "REPORTED";
        severity?: "HIGH" | "CRITICAL";
    }): Promise<{ success: boolean; entityKey?: string; txHash?: string; error?: string }> {
        if (!arkivWriter) {
            return { success: false, error: "Arkiv wallet client not initialized" };
        }

        try {
            const normalizedAddr = params.address.toLowerCase() as `0x${string}`;
            const { entityKey, txHash } = await arkivWriter.createEntity(
                FraudBlacklistSchema as any,
                {
                    flaggedAddress: addr(normalizedAddr),
                    reason: params.reason,
                    source: params.source || "REPORTED",
                    severity: params.severity || "HIGH",
                    flaggedAt: new Date().toISOString()
                },
                {
                    expiration: ExpirationTime.fromDays(365) // 1 year blacklist record
                }
            );

            console.log(`[Arkiv] Flagged scammer ${normalizedAddr} to public blacklist (key: ${entityKey}, tx: ${txHash})`);
            return { success: true, entityKey, txHash };
        } catch (err: any) {
            console.warn(`[Arkiv] Error flagging scammer on Arkiv: ${err.message}`);
            return { success: false, error: err.message };
        }
    }
}
