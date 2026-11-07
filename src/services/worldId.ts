/**
 * P2P Father — World ID & World App MiniKit Verification Service
 *
 * Implements privacy-preserving Proof-of-Human verification for P2P traders:
 * 1. Zero-Knowledge Proof validation via World Developer Portal API v2
 * 2. Sybil-resistance: 1 Human = 1 P2P Trader (prevents mule account farming)
 * 3. Zero PII storage (complying with DPDP & banking privacy regulations)
 */

import axios from "axios";
import { env } from "../config/env";
import { db } from "../db/client";

export interface WorldIdVerifyParams {
    userId: string;
    merkle_root: string;
    nullifier_hash: string;
    proof: string;
    verification_level?: "orb" | "device";
    action?: string;
    signal?: string;
}

export interface WorldIdVerifyResult {
    success: boolean;
    verification_level?: "orb" | "device";
    nullifier_hash?: string;
    action?: string;
    error?: string;
    code?: string;
    detail?: string;
}

export class WorldIdService {
    private readonly VERIFY_API_BASE = "https://developer.worldcoin.org/api/v2/verify";

    /**
     * Get client configuration for World App MiniKit or IDKit widget
     */
    getConfig() {
        return {
            app_id: env.WORLD_APP_ID || "app_staging_p2pfather_dev",
            action: env.WORLD_ACTION || "p2pfather-trader-verification",
            is_staging: (env.WORLD_APP_ID || "").startsWith("app_staging_"),
        };
    }

    /**
     * Check if a trader is already verified via World ID
     */
    async getStatus(userId: string): Promise<{
        is_verified: boolean;
        level: "orb" | "device" | null;
        nullifier_hash: string | null;
        verified_at: string | null;
    }> {
        try {
            const user = await db.getUserById(userId);
            if (!user) {
                return { is_verified: false, level: null, nullifier_hash: null, verified_at: null };
            }

            const isWorldId = (user.kyc_document_type || "").startsWith("world_id");
            const level = user.kyc_document_type?.includes("device")
                ? "device"
                : user.kyc_document_type?.includes("orb")
                ? "orb"
                : null;

            return {
                is_verified: !!(user.is_verified && isWorldId),
                level,
                nullifier_hash: isWorldId ? (user.kyc_session_id || null) : null,
                verified_at: user.kyc_verified_at || null,
            };
        } catch (err: any) {
            console.error("[WORLD ID] Error checking status:", err.message);
            return { is_verified: false, level: null, nullifier_hash: null, verified_at: null };
        }
    }

    /**
     * Verify a Zero-Knowledge World ID Proof and upgrade trader to Verified Human
     */
    async verifyTraderProof(params: WorldIdVerifyParams): Promise<WorldIdVerifyResult> {
        const appId = env.WORLD_APP_ID || "app_staging_p2pfather_dev";
        const action = params.action || env.WORLD_ACTION || "p2pfather-trader-verification";
        const verificationLevel = params.verification_level || "orb";

        if (!params.userId) {
            return { success: false, error: "User ID is required", code: "missing_user_id" };
        }
        if (!params.nullifier_hash || !params.merkle_root || !params.proof) {
            return { success: false, error: "Missing cryptographic proof parameters", code: "invalid_payload" };
        }

        // 1. Check user exists
        const user = await db.getUserById(params.userId);
        if (!user) {
            return { success: false, error: "Trader account not found", code: "user_not_found" };
        }

        // 2. Sybil Resistance Check: Ensure this nullifier has not been registered by ANY other user
        const supabase = (db as any).getClient();
        try {
            const { data: existingTrader } = await supabase
                .from("users")
                .select("id, username")
                .eq("kyc_session_id", params.nullifier_hash)
                .neq("id", user.id)
                .maybeSingle();

            if (existingTrader) {
                console.warn(`[WORLD ID SYBIL ALERT] Nullifier ${params.nullifier_hash.slice(0, 10)}... already claimed by user ${existingTrader.id}`);
                return {
                    success: false,
                    error: "Sybil Protection: This World ID is already associated with another P2PFather merchant account. Multi-accounting is strictly prohibited to eliminate mule account fraud.",
                    code: "duplicate_nullifier",
                    detail: "Each human is limited to exactly 1 verified trader account."
                };
            }
        } catch (dbErr: any) {
            console.warn("[WORLD ID] Could not check nullifier uniqueness in DB (continuing):", dbErr.message);
        }

        // 3. Verify against Worldcoin Developer API v2
        let apiVerified = false;
        const isSimulated = params.proof.startsWith("0xsimulated") || params.proof.startsWith("0xmock");

        if (isSimulated && (process.env.NODE_ENV !== "production" || appId.startsWith("app_staging_"))) {
            // Testnet / Simulator / Sandbox developer mode
            console.log(`[WORLD ID DEV] Accepting simulated proof for staging app ${appId}`);
            apiVerified = true;
        } else {
            try {
                const response = await axios.post(
                    `${this.VERIFY_API_BASE}/${appId}`,
                    {
                        merkle_root: params.merkle_root,
                        nullifier_hash: params.nullifier_hash,
                        proof: params.proof,
                        verification_level: verificationLevel,
                        action,
                        signal: params.signal || params.userId,
                    },
                    {
                        headers: {
                            "Content-Type": "application/json",
                            "User-Agent": "P2PFather-WorldApp/2.0",
                        },
                        timeout: 10000,
                    }
                );

                if (response.data?.success) {
                    apiVerified = true;
                } else {
                    return {
                        success: false,
                        error: "World ID proof verification was rejected by Developer Portal",
                        code: response.data?.code || "verification_failed",
                        detail: response.data?.detail,
                    };
                }
            } catch (err: any) {
                const errorData = err.response?.data;
                console.error("[WORLD ID] Developer API Error:", errorData || err.message);

                return {
                    success: false,
                    error: errorData?.message || errorData?.detail || "World ID verification failed",
                    code: errorData?.code || "world_api_error",
                    detail: errorData?.detail || "Ensure your World App ID is registered at developer.worldcoin.org",
                };
            }
        }

        if (!apiVerified) {
            return { success: false, error: "Proof verification failed", code: "verification_rejected" };
        }

        // 4. Update user to Verified Human Status
        const docType = `world_id_${verificationLevel}`;
        try {
            await supabase
                .from("users")
                .update({
                    kyc_status: "approved",
                    is_verified: true,
                    kyc_document_type: docType,
                    kyc_country: "WORLD_ID",
                    kyc_verified_at: new Date().toISOString(),
                    kyc_session_id: params.nullifier_hash,
                })
                .eq("id", user.id);

            console.log(`[WORLD ID SUCCESS] Trader ${user.username || user.id} verified as ${docType} (Nullifier: ${params.nullifier_hash.slice(0, 10)}...)`);

            return {
                success: true,
                verification_level: verificationLevel,
                nullifier_hash: params.nullifier_hash,
                action,
            };
        } catch (updateErr: any) {
            console.error("[WORLD ID] Error updating user profile in DB:", updateErr);
            return {
                success: false,
                error: "Verification succeeded on World ID, but database update failed.",
                code: "database_error",
            };
        }
    }
}

export const worldIdService = new WorldIdService();

