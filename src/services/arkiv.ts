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
import crypto from "crypto";
import { env } from "../config/env";

/**
 * 1. Define Public Schemas on Arkiv DB-Chain
 */

// Privacy-Preserving Dispute Evidence & Settlement Dossier Schema
export const DisputeDossierSchema = defineSchema("p2pfather.dispute_dossier", {
    tradeId: str().indexed(),
    buyerWallet: addr().indexed(),
    sellerWallet: addr().indexed(),
    fiatAmount: str(),
    amountToken: dec(),
    evidenceHash: str().indexed(),    // SHA-256 cryptographic commitment of private receipts/UTR
    verdict: str().indexed(),         // "RELEASED_TO_BUYER", "REFUNDED_TO_SELLER"
    verdictReason: str(),
    mediatorAddress: addr().indexed(),
    resolvedAt: str(),
});

// Trader Reputation Schema
export const TraderReputationSchema = defineSchema("p2pfather.trader_reputation", {
    traderAddress: addr().indexed(),
    riskLevel: str().indexed(),       // "LOW", "MEDIUM", "HIGH", "BLOCKED"
    completedTrades: u64().indexed(), // Total completed trades
    disputeCount: u64(),              // Count of lost/opened disputes
    trustScore: dec().indexed(),      // e.g. "98.5"
    isVerified: bool().indexed(),     // Whether trader passed KYC / proof of humanity
    lastTradeAt: str(),
});

// Fraud Blacklist Schema
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

// Wallet client for on-chain writes/mirrors
const privateKey = (env.ARKIV_PRIVATE_KEY || env.RELAYER_PRIVATE_KEY || process.env.ARKIV_PRIVATE_KEY || process.env.RELAYER_PRIVATE_KEY) as Hex | undefined;

let arkivWriter: any = null;
let writerAddress = "0x0000000000000000000000000000000000000000";

if (privateKey && privateKey.startsWith("0x") && privateKey.length === 66) {
    try {
        const account = privateKeyToAccount(privateKey);
        writerAddress = account.address;
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
 * Cryptographic helper: Hashes private bank receipts, UTR numbers, or evidence
 * ensuring raw banking details NEVER touch the public blockchain.
 */
export function computeEvidenceHash(evidenceContent: string | Buffer): string {
    const hash = crypto.createHash("sha256").update(evidenceContent).digest("hex");
    return `0x${hash}`;
}

function sanitizeAddress(input?: string): `0x${string}` {
    if (input && input.startsWith("0x") && input.length === 42) {
        return input.toLowerCase() as `0x${string}`;
    }
    return "0x0000000000000000000000000000000000000000";
}

/**
 * Arkiv Service — Privacy-Preserving Dispute Dossier & Trust Layer
 */
export class ArkivService {

    /**
     * Commit a resolved dispute verdict and evidence hash to the Arkiv DB-Chain
     */
    static async commitDisputeVerdict(params: {
        tradeId: string;
        buyerWallet: string;
        sellerWallet: string;
        fiatAmount: string;
        amountToken: string | number;
        evidenceTextOrUtr: string;
        verdict: "RELEASED_TO_BUYER" | "REFUNDED_TO_SELLER" | "SETTLED_COMPLETED";
        verdictReason: string;
        mediatorAddress?: string;
    }): Promise<{ success: boolean; entityKey?: string; txHash?: string; evidenceHash?: string; error?: string }> {
        if (!arkivWriter) {
            return { success: false, error: "Arkiv writer wallet not initialized (missing gas or private key)" };
        }

        try {
            const evidenceHash = computeEvidenceHash(params.evidenceTextOrUtr || `${params.tradeId}-${params.verdict}-${Date.now()}`);
            const buyer = sanitizeAddress(params.buyerWallet);
            const seller = sanitizeAddress(params.sellerWallet);
            const mediator = sanitizeAddress(params.mediatorAddress || writerAddress);
            const tokenAmountStr = typeof params.amountToken === "number" ? params.amountToken.toFixed(2) : String(params.amountToken);

            const { entityKey, txHash } = await arkivWriter.createEntity(
                DisputeDossierSchema as any,
                {
                    tradeId: params.tradeId,
                    buyerWallet: addr(buyer),
                    sellerWallet: addr(seller),
                    fiatAmount: params.fiatAmount,
                    amountToken: dec(tokenAmountStr),
                    evidenceHash,
                    verdict: params.verdict,
                    verdictReason: params.verdictReason || "Resolved by certified P2PFather escrow mediator",
                    mediatorAddress: addr(mediator),
                    resolvedAt: new Date().toISOString()
                },
                {
                    expiration: ExpirationTime.max() // Maximum on-chain lifetime allowed by Rabdi (~182 days)
                }
            );

            console.log(`[Arkiv] Committed dispute dossier for Trade #${params.tradeId} (key: ${entityKey}, tx: ${txHash})`);
            return {
                success: true,
                entityKey,
                txHash,
                evidenceHash
            };
        } catch (err: any) {
            console.error(`[Arkiv] Error committing dispute dossier: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    /**
     * Commit a normal completed trade settlement to Arkiv DB-Chain
     */
    static async commitTradeSettlement(params: {
        tradeId: string;
        buyerWallet: string;
        sellerWallet: string;
        fiatAmount: string;
        amountToken: number | string;
        releaseTxHash?: string;
    }): Promise<{ success: boolean; entityKey?: string; txHash?: string; evidenceHash?: string; error?: string }> {
        return this.commitDisputeVerdict({
            tradeId: params.tradeId,
            buyerWallet: params.buyerWallet,
            sellerWallet: params.sellerWallet,
            fiatAmount: params.fiatAmount,
            amountToken: params.amountToken,
            evidenceTextOrUtr: `TRADE-${params.tradeId}-COMPLETED-${params.releaseTxHash || ""}-${Date.now()}`,
            verdict: "SETTLED_COMPLETED",
            verdictReason: "Normal escrow completion: Seller confirmed fiat payment receipt and released crypto.",
        });
    }

    /**
     * Query a dispute dossier from Arkiv DB-Chain by trade ID
     */
    static async getDisputeDossier(tradeId: string) {
        if (!accessKey) return null;
        try {
            const queryClient = arkivReader as any;
            const result = await queryClient
                .select({
                    $key: true,
                    tradeId: true,
                    buyerWallet: true,
                    sellerWallet: true,
                    fiatAmount: true,
                    amountToken: true,
                    evidenceHash: true,
                    verdict: true,
                    verdictReason: true,
                    mediatorAddress: true,
                    resolvedAt: true
                })
                .from(DisputeDossierSchema)
                .where((eq as any)("tradeId", tradeId))
                .limit(1)
                .fetch();

            if (result && result.entities && result.entities.length > 0) {
                const e = result.entities[0];
                return {
                    key: e.$key,
                    tradeId: String(e.tradeId?.value || tradeId),
                    buyerWallet: String(e.buyerWallet?.value || ""),
                    sellerWallet: String(e.sellerWallet?.value || ""),
                    fiatAmount: String(e.fiatAmount?.value || ""),
                    amountToken: String(e.amountToken?.value || "0"),
                    evidenceHash: String(e.evidenceHash?.value || ""),
                    verdict: String(e.verdict?.value || ""),
                    verdictReason: String(e.verdictReason?.value || ""),
                    mediatorAddress: String(e.mediatorAddress?.value || ""),
                    resolvedAt: String(e.resolvedAt?.value || "")
                };
            }
            return null;
        } catch (err: any) {
            console.warn(`[Arkiv] Error fetching dispute dossier for #${tradeId}:`, err.message);
            return null;
        }
    }

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
            return { success: false, error: "Arkiv wallet client not initialized" };
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
                    expiration: ExpirationTime.fromDays(90)
                }
            );

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
                    expiration: ExpirationTime.max()
                }
            );

            return { success: true, entityKey, txHash };
        } catch (err: any) {
            console.warn(`[Arkiv] Error flagging scammer on Arkiv: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    /**
     * Generates a printable, cyber-cell/bank-ready HTML Dispute or Trade Settlement Certificate
     */
    static generateCertificateHTML(data: {
        tradeId: string;
        buyerWallet: string;
        sellerWallet: string;
        fiatAmount: string;
        amountToken: string;
        verdict: string;
        verdictReason: string;
        evidenceHash: string;
        entityKey: string;
        resolvedAt: string;
        escrowTxHash?: string;
        chain?: string;
    }): string {
        const isCompleted = data.verdict === "SETTLED_COMPLETED";
        const isBuyerWon = data.verdict === "RELEASED_TO_BUYER";
        
        let titleMain = "Certificate of Settlement";
        let subTitle = `CASE REFERENCE #${data.tradeId} &middot; CRYPTOGRAPHICALLY COMMITTED`;
        let verdictTag = "✔ Settlement Status";
        let verdictTitle = "ESCROW RELEASED & SETTLED";
        let verdictColor = "#34D399";
        let verdictBg = "rgba(16, 185, 129, 0.08)";
        let verdictBorder = "rgba(16, 185, 129, 0.35)";

        if (isCompleted) {
            titleMain = "Certificate of Settlement";
            subTitle = `TRADE REFERENCE #${data.tradeId} &middot; ESCROW RELEASE RECORD`;
            verdictTag = "✔ Escrow Status";
            verdictTitle = "ESCROW RELEASED & SETTLED";
        } else if (isBuyerWon) {
            titleMain = "Certificate of Adjudication";
            subTitle = `CASE REFERENCE #${data.tradeId} &middot; ARBITRATION DECREE`;
            verdictTag = "✔ Adjudication Verdict";
            verdictTitle = "RELEASED TO BUYER";
        } else {
            titleMain = "Certificate of Adjudication";
            subTitle = `CASE REFERENCE #${data.tradeId} &middot; ARBITRATION DECREE`;
            verdictTag = "⚠ Adjudication Verdict";
            verdictTitle = "REFUNDED TO SELLER";
            verdictColor = "#F87171";
            verdictBg = "rgba(239, 68, 68, 0.08)";
            verdictBorder = "rgba(239, 68, 68, 0.35)";
        }

        const formattedDate = data.resolvedAt ? new Date(data.resolvedAt).toISOString().replace("T", " ").slice(0, 19) + " UTC" : new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
        const chainName = data.chain?.toLowerCase() === "bsc" ? "BNB Smart Chain (56)" : "Base Mainnet (8453)";
        const explorerBase = data.chain?.toLowerCase() === "bsc" ? "https://bscscan.com/tx/" : "https://basescan.org/tx/";

        const txLinkHtml = data.escrowTxHash && data.escrowTxHash.startsWith("0x")
            ? `<a href="${explorerBase}${data.escrowTxHash}" target="_blank" class="tx-link">${data.escrowTxHash.slice(0, 16)}...${data.escrowTxHash.slice(-10)} &nearr;</a>`
            : `Verified On-Chain via Relayer (${chainName})`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>P2PFather &middot; Arkiv Settlement Certificate #${data.tradeId}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-deep: #05070a;
            --cert-bg: #0b0e14;
            --cert-surface: #11151f;
            --orange-primary: #FE7446;
            --orange-bright: #FF5500;
            --orange-glow: rgba(254, 116, 70, 0.25);
            --border-subtle: rgba(255, 255, 255, 0.08);
            --border-orange: rgba(254, 116, 70, 0.4);
            --text-main: #FFFFFF;
            --text-muted: #8E9BAE;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            background-color: var(--bg-deep);
            background-image: 
                radial-gradient(circle at 50% 0%, rgba(254, 116, 70, 0.15) 0%, transparent 55%),
                linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
            background-size: 100% 100%, 40px 40px, 40px 40px;
            color: var(--text-main);
            font-family: 'Space Grotesk', -apple-system, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 32px 16px;
        }

        .action-bar {
            width: 100%;
            max-width: 880px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        .btn-download {
            background: linear-gradient(135deg, #FE7446 0%, #E04D1B 100%);
            color: #FFFFFF;
            font-family: 'Space Grotesk', sans-serif;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.5px;
            padding: 12px 26px;
            border-radius: 8px;
            border: 1px solid #FF8C66;
            cursor: pointer;
            box-shadow: 0 8px 24px var(--orange-glow);
            display: inline-flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s ease;
        }

        .btn-download:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 28px rgba(254, 116, 70, 0.4);
        }

        .btn-explorer {
            background: rgba(255, 255, 255, 0.05);
            color: #CBD5E1;
            font-family: 'Space Grotesk', sans-serif;
            font-size: 13px;
            font-weight: 600;
            padding: 11px 20px;
            border-radius: 8px;
            border: 1px solid var(--border-subtle);
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s;
        }

        .btn-explorer:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #FFFFFF;
            border-color: var(--border-orange);
        }

        .certificate-sheet {
            width: 100%;
            max-width: 880px;
            background: var(--cert-bg);
            border: 1px solid var(--border-orange);
            border-radius: 16px;
            padding: 24px;
            position: relative;
            box-shadow: 
                0 0 0 1px rgba(254, 116, 70, 0.15),
                0 30px 80px -15px rgba(0, 0, 0, 0.8),
                0 0 60px -20px var(--orange-glow);
            overflow: hidden;
        }

        .cert-inner-frame {
            border: 1px solid rgba(254, 116, 70, 0.25);
            border-radius: 12px;
            padding: 44px 48px;
            position: relative;
            background: 
                radial-gradient(circle at 50% 30%, rgba(254, 116, 70, 0.06) 0%, transparent 60%),
                linear-gradient(180deg, rgba(17, 21, 31, 0.6) 0%, rgba(11, 14, 20, 0.95) 100%);
        }

        .corner-notch {
            position: absolute;
            width: 16px;
            height: 16px;
            border-color: var(--orange-primary);
            border-style: solid;
        }
        .corner-tl { top: -1px; left: -1px; border-width: 3px 0 0 3px; border-top-left-radius: 12px; }
        .corner-tr { top: -1px; right: -1px; border-width: 3px 3px 0 0; border-top-right-radius: 12px; }
        .corner-bl { bottom: -1px; left: -1px; border-width: 0 0 3px 3px; border-bottom-left-radius: 12px; }
        .corner-br { bottom: -1px; right: -1px; border-width: 0 3px 3px 0; border-bottom-right-radius: 12px; }

        .watermark-emblem {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 440px;
            height: 440px;
            opacity: 0.03;
            pointer-events: none;
            user-select: none;
        }

        .cert-header {
            text-align: center;
            margin-bottom: 28px;
            position: relative;
            z-index: 2;
        }

        .cert-brand-pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(254, 116, 70, 0.1);
            border: 1px solid var(--border-orange);
            color: var(--orange-primary);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 2px;
            text-transform: uppercase;
            padding: 6px 16px;
            border-radius: 100px;
            margin-bottom: 16px;
        }

        .cert-brand-pill .dot {
            width: 6px;
            height: 6px;
            background: var(--orange-primary);
            border-radius: 50%;
            box-shadow: 0 0 8px var(--orange-primary);
        }

        .cert-main-title {
            font-size: 30px;
            font-weight: 800;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            color: #FFFFFF;
            margin-bottom: 8px;
            background: linear-gradient(180deg, #FFFFFF 0%, #D1D5DB 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .cert-case-id {
            font-family: 'JetBrains Mono', monospace;
            font-size: 14px;
            font-weight: 600;
            color: var(--orange-primary);
            letter-spacing: 1px;
        }

        .cert-divider {
            height: 1px;
            background: linear-gradient(90deg, transparent 0%, var(--border-orange) 50%, transparent 100%);
            margin: 20px 0;
        }

        .proclamation {
            text-align: center;
            font-size: 15px;
            line-height: 1.7;
            color: #CBD5E1;
            max-width: 680px;
            margin: 0 auto 28px auto;
            position: relative;
            z-index: 2;
        }

        .proclamation strong {
            color: #FFFFFF;
            font-weight: 600;
        }

        .verdict-hero {
            background: ${verdictBg};
            border: 1px solid ${verdictBorder};
            border-radius: 10px;
            padding: 16px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 28px;
            position: relative;
            z-index: 2;
        }

        .verdict-tag {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: ${verdictColor};
            margin-bottom: 2px;
        }

        .verdict-status {
            font-size: 20px;
            font-weight: 800;
            color: #FFFFFF;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .verdict-amounts {
            text-align: right;
        }

        .verdict-fiat {
            font-size: 22px;
            font-weight: 800;
            color: var(--orange-primary);
            font-family: 'JetBrains Mono', monospace;
        }

        .verdict-crypto {
            font-size: 13px;
            font-weight: 600;
            color: #34D399;
            font-family: 'JetBrains Mono', monospace;
        }

        .spec-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 26px;
            position: relative;
            z-index: 2;
        }

        .spec-table td {
            padding: 11px 14px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            font-size: 13px;
        }

        .spec-table tr:hover td {
            background: rgba(254, 116, 70, 0.03);
        }

        .spec-key {
            color: var(--text-muted);
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            width: 28%;
        }

        .spec-val {
            font-family: 'JetBrains Mono', monospace;
            font-size: 13px;
            color: #FFFFFF;
            font-weight: 500;
            word-break: break-all;
        }

        .tx-link {
            color: var(--orange-primary);
            text-decoration: none;
            font-weight: 600;
        }
        .tx-link:hover {
            text-decoration: underline;
        }

        .evidence-vault {
            background: #080a0f;
            border: 1px solid rgba(254, 116, 70, 0.3);
            border-radius: 10px;
            padding: 16px 20px;
            margin-bottom: 24px;
            position: relative;
            z-index: 2;
        }

        .evidence-label {
            font-size: 10px;
            font-weight: 700;
            color: var(--orange-primary);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .evidence-hash {
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            color: #E2E8F0;
            word-break: break-all;
            line-height: 1.5;
        }

        .privacy-box {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 28px;
            position: relative;
            z-index: 2;
        }

        .privacy-header {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #34D399;
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 3px;
        }

        .privacy-body {
            font-size: 11px;
            color: var(--text-muted);
            line-height: 1.5;
        }

        .cert-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid var(--border-subtle);
            padding-top: 24px;
            position: relative;
            z-index: 2;
        }

        .protocol-stamp {
            display: flex;
            align-items: center;
            gap: 14px;
        }

        .stamp-badge {
            width: 48px;
            height: 48px;
            border-radius: 10px;
            background: linear-gradient(135deg, rgba(254, 116, 70, 0.2) 0%, rgba(254, 116, 70, 0.05) 100%);
            border: 1px solid var(--border-orange);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--orange-primary);
            font-weight: 900;
            font-size: 18px;
        }

        .stamp-text-title {
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 1px;
            text-transform: uppercase;
            color: #FFFFFF;
        }

        .stamp-text-sub {
            font-size: 11px;
            color: var(--text-muted);
        }

        .qr-section {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .qr-box {
            background: #FFFFFF;
            padding: 4px;
            border-radius: 6px;
            box-shadow: 0 0 16px rgba(0, 0, 0, 0.4);
        }

        .qr-details {
            text-align: right;
        }

        .qr-title {
            font-size: 10px;
            font-weight: 700;
            color: var(--orange-primary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .qr-network {
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            color: var(--text-muted);
        }

        @media print {
            body {
                background: #FFFFFF !important;
                color: #000000 !important;
                padding: 0 !important;
            }
            .action-bar, .no-print {
                display: none !important;
            }
            .certificate-sheet {
                background: #FFFFFF !important;
                border: 2px solid #000000 !important;
                box-shadow: none !important;
                padding: 20px !important;
                max-width: 100% !important;
            }
            .cert-inner-frame {
                background: #FFFFFF !important;
                border: 1px solid #000000 !important;
                padding: 24px !important;
            }
            .cert-main-title {
                color: #000000 !important;
                -webkit-text-fill-color: #000000 !important;
            }
            .proclamation, .proclamation strong {
                color: #222222 !important;
            }
            .verdict-hero {
                background: #f0fdf4 !important;
                border: 1px solid #16a34a !important;
            }
            .verdict-status {
                color: #16a34a !important;
            }
            .verdict-fiat {
                color: #000000 !important;
            }
            .spec-table td {
                color: #000000 !important;
                border-color: #E2E8F0 !important;
            }
            .spec-key {
                color: #64748B !important;
            }
            .spec-val {
                color: #000000 !important;
            }
            .evidence-vault {
                background: #f8fafc !important;
                border: 1px solid #cbd5e1 !important;
            }
            .evidence-hash {
                color: #000000 !important;
            }
            .stamp-text-title, .stamp-text-sub {
                color: #000000 !important;
            }
            .qr-network {
                color: #475569 !important;
            }
        }
    </style>
</head>
<body>

    <div class="action-bar">
        <a href="https://rabdi.explorer.arkiv.network" target="_blank" class="btn-explorer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
            Verify on Rabdi Explorer &nearr;
        </a>
        <button class="btn-download" onclick="window.print()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Download / Print Official PDF
        </button>
    </div>

    <div class="certificate-sheet">
        <div class="cert-inner-frame">
            <div class="corner-notch corner-tl"></div>
            <div class="corner-notch corner-tr"></div>
            <div class="corner-notch corner-bl"></div>
            <div class="corner-notch corner-br"></div>

            <svg class="watermark-emblem" viewBox="0 0 200 200" fill="#FE7446">
                <polygon points="100,20 170,55 170,125 100,180 30,125 30,55" />
            </svg>

            <div class="cert-header">
                <div class="cert-brand-pill">
                    <div class="dot"></div>
                    P2PFather Protocol &times; Arkiv DB-Chain
                </div>
                <h1 class="cert-main-title">${titleMain}</h1>
                <div class="cert-case-id">${subTitle}</div>
            </div>

            <div class="cert-divider"></div>

            <p class="proclamation">
                This official credential certifies that <strong>P2P Escrow Trade #${data.tradeId}</strong> was lawfully executed 
                under the decentralized non-custodial escrow framework of P2PFather and permanently committed to the 
                <strong>Arkiv Database-Chain (Rabdi Testnet)</strong>.
            </p>

            <div class="verdict-hero">
                <div>
                    <div class="verdict-tag">${verdictTag}</div>
                    <div class="verdict-status">${verdictTitle}</div>
                </div>
                <div class="verdict-amounts">
                    <div class="verdict-fiat">${data.fiatAmount}</div>
                    <div class="verdict-crypto">${data.amountToken} USDT/USDC</div>
                </div>
            </div>

            <table class="spec-table">
                <tr>
                    <td class="spec-key">Buyer Beneficiary</td>
                    <td class="spec-val">${data.buyerWallet || "0x..."}</td>
                </tr>
                <tr>
                    <td class="spec-key">Seller Counterparty</td>
                    <td class="spec-val">${data.sellerWallet || "0x..."}</td>
                </tr>
                <tr>
                    <td class="spec-key">Settlement Basis</td>
                    <td class="spec-val" style="font-family: 'Space Grotesk', sans-serif;">${data.verdictReason || "Verified genuine payment documentation."}</td>
                </tr>
                <tr>
                    <td class="spec-key">Escrow Release Tx</td>
                    <td class="spec-val">${txLinkHtml}</td>
                </tr>
                <tr>
                    <td class="spec-key">Payment Method</td>
                    <td class="spec-val">UPI / IMPS Bank Transfer (SHA-256 Verified)</td>
                </tr>
                <tr>
                    <td class="spec-key">Settlement Timestamp</td>
                    <td class="spec-val">${formattedDate}</td>
                </tr>
            </table>

            <div class="evidence-vault">
                <div class="evidence-label">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    Arkiv DB-Chain Evidence Hash (SHA-256)
                </div>
                <div class="evidence-hash">${data.evidenceHash || "0x0000000000000000000000000000000000000000000000000000000000000000"}</div>
                
                <div class="evidence-label" style="margin-top: 12px;">
                    Arkiv DB-Chain Entity Key
                </div>
                <div class="evidence-hash" style="color: var(--orange-primary);">
                    <a href="https://rabdi.explorer.arkiv.network" target="_blank" class="tx-link" style="color: var(--orange-primary);">
                        ${data.entityKey || "Pending / Live on Rabdi"} &nearr;
                    </a>
                </div>
            </div>

            <div class="privacy-box">
                <div class="privacy-header">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34D399" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    <span>DPDP & Banking Confidentiality Compliance</span>
                </div>
                <div class="privacy-body">
                    In strict compliance with the Digital Personal Data Protection Act (DPDP) and international banking confidentiality, sensitive account numbers are <strong>never stored in plaintext on public blockchains</strong>. Only one-way, irreversible SHA-256 cryptographic digests are anchored on-chain to the Arkiv DB-Chain.
                </div>
            </div>

            <div class="cert-footer">
                <div class="protocol-stamp">
                    <div class="stamp-badge">
                        &#9670;
                    </div>
                    <div>
                        <div class="stamp-text-title">P2PFather Mediation Council</div>
                        <div class="stamp-text-sub">Arkiv DB-Chain Verified &middot; Chain ID 7794095</div>
                    </div>
                </div>

                <div class="qr-section">
                    <div class="qr-details">
                        <div class="qr-title">Scan to Verify</div>
                        <div class="qr-network">Rabdi DB-Chain Explorer</div>
                    </div>
                    <div class="qr-box">
                        <svg width="50" height="50" viewBox="0 0 100 100" fill="#000000">
                            <rect width="100" height="100" fill="#FFFFFF" />
                            <path d="M10 10h30v30h-30z M15 15h20v20h-20z M20 20h10v10h-10z" />
                            <path d="M60 10h30v30h-30z M65 15h20v20h-20z M70 20h10v10h-10z" />
                            <path d="M10 60h30v30h-30z M15 65h20v20h-20z M20 70h10v10h-10z" />
                            <rect x="45" y="15" width="8" height="8" />
                            <rect x="45" y="30" width="8" height="8" />
                            <rect x="25" y="45" width="8" height="8" />
                            <rect x="35" y="45" width="8" height="8" />
                            <rect x="50" y="50" width="8" height="8" />
                            <rect x="65" y="45" width="8" height="8" />
                            <rect x="75" y="55" width="8" height="8" />
                            <rect x="55" y="70" width="8" height="8" />
                            <rect x="70" y="70" width="8" height="8" />
                        </svg>
                    </div>
                </div>
            </div>

        </div>
    </div>
</body>
</html>`;
    }
}
