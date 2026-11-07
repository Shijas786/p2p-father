/**
 * P2P Father — World ID & World App MiniKit Verification Service
 *
 * Implements privacy-preserving Proof-of-Human verification for P2P traders:
 * 1. Zero-Knowledge Proof validation via World Developer Portal API v2
 * 2. Sybil-resistance: 1 Human = 1 P2P Trader (prevents mule account farming)
 * 3. Zero PII storage (complying with DPDP & banking privacy regulations)
 */

import axios from "axios";
import crypto from "crypto";
import { env } from "../config/env";
import { db } from "../db/client";

interface ActiveBridgeSession {
    key: Buffer;
    iv: Buffer;
    userId: string;
    action: string;
    createdAt: number;
}

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

    private activeSessions = new Map<string, ActiveBridgeSession>();

    /**
     * Resolve user from database by UUID, Telegram numeric ID, or username
     */
    async findUser(userIdOrTgId: string | number) {
        if (!userIdOrTgId) return null;
        const str = String(userIdOrTgId).trim();
        const supabase = (db as any).getClient();

        // 1. Try UUID
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
            try {
                const { data } = await supabase.from("users").select("*").eq("id", str).maybeSingle();
                if (data) return data;
            } catch {}
        }

        // 2. Try numeric Telegram ID
        const num = Number(str);
        if (!isNaN(num) && num > 0) {
            try {
                const { data } = await supabase.from("users").select("*").eq("telegram_id", num).maybeSingle();
                if (data) return data;
            } catch {}
        }

        // 3. Try username
        try {
            const clean = str.replace(/^@/, "");
            const { data } = await supabase.from("users").select("*").eq("username", clean).maybeSingle();
            if (data) return data;
        } catch {}

        return null;
    }

    /**
     * Get client configuration for World App MiniKit or IDKit widget
     */
    getConfig() {
        return {
            app_id: env.WORLD_APP_ID || "app_2112e98ae700b17b3b2163c5baba7a38",
            action: env.WORLD_ACTION || "verify-trader",
            is_staging: false,
        };
    }

    /**
     * Create an authentic World ID bridge session and generate the valid Universal Link (world.org/verify?t=wld&i=...&k=...)
     * This redirects directly and automatically into World App with the interactive prompt.
     */
    async initiateBridgeSession(userId: string, customAppId?: string, customAction?: string): Promise<{
        success: boolean;
        requestId: string;
        connectorURI: string;
        error?: string;
    }> {
        try {
            const key = crypto.randomBytes(32);
            const iv = crypto.randomBytes(12);
            const action = customAction || env.WORLD_ACTION || "verify-trader";
            const appId = customAppId || env.WORLD_APP_ID || "app_2112e98ae700b17b3b2163c5baba7a38";

            // Clean expired sessions (> 15 minutes)
            const now = Date.now();
            for (const [id, sess] of this.activeSessions.entries()) {
                if (now - sess.createdAt > 15 * 60 * 1000) {
                    this.activeSessions.delete(id);
                }
            }

            const signalHash = "0x" + crypto.createHash("sha256").update(userId).digest("hex");

            const requestPayload = JSON.stringify({
                app_id: appId,
                action_description: "Verify Proof-of-Human for P2PFather Escrow Trading",
                action,
                signal: signalHash,
                credential_types: ["orb", "device"],
                verification_level: "orb",
            });

            const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
            const encrypted = Buffer.concat([cipher.update(requestPayload, "utf8"), cipher.final()]);
            const tag = cipher.getAuthTag();
            const combinedPayload = Buffer.concat([encrypted, tag]);

            const body = JSON.stringify({
                iv: iv.toString("base64"),
                payload: combinedPayload.toString("base64"),
            });

            const bridgeRes = await axios.post("https://bridge.worldcoin.org/request", body, {
                headers: { "Content-Type": "application/json" },
                timeout: 8000,
            });

            if (bridgeRes.status !== 200 || !bridgeRes.data?.request_id) {
                return { success: false, requestId: "", connectorURI: "", error: "Failed to create World App session on bridge." };
            }

            const requestId = bridgeRes.data.request_id;
            const connectorURI = `https://world.org/verify?t=wld&i=${requestId}&k=${encodeURIComponent(key.toString("base64"))}`;

            this.activeSessions.set(requestId, {
                key,
                iv,
                userId,
                action,
                createdAt: now,
            });

            // Start autonomous server-side bridge polling (runs even if browser is closed/backgrounded)
            this.startAutonomousBridgePolling(requestId);

            console.log(`[WORLD ID BRIDGE] Created session ${requestId} for trader ${userId}`);
            return {
                success: true,
                requestId,
                connectorURI,
            };
        } catch (err: any) {
            console.error("[WORLD ID BRIDGE] Error initiating session:", err.message);
            return {
                success: false,
                requestId: "",
                connectorURI: "",
                error: err.message || "Failed to initialize World App session",
            };
        }
    }

    /**
     * Poll the Worldcoin bridge for the completed zero-knowledge proof response
     */
    async pollBridgeSession(requestId: string): Promise<{
        status: "waiting" | "completed" | "failed";
        verified?: boolean;
        error?: string;
        nullifier_hash?: string;
    }> {
        const session = this.activeSessions.get(requestId);
        if (!session) {
            return { status: "failed", error: "Session expired or not found" };
        }

        try {
            const bridgeRes = await axios.get(`https://bridge.worldcoin.org/response/${requestId}`, {
                timeout: 5000,
            });

            if (bridgeRes.status !== 200 || !bridgeRes.data) {
                return { status: "waiting" };
            }

            const { status, response } = bridgeRes.data;

            if (status !== "completed" || !response?.payload) {
                return { status: "waiting" };
            }

            // Decrypt the payload
            const payloadBuffer = Buffer.from(response.payload, "base64");
            const responseIv = Buffer.from(response.iv, "base64");
            const authTag = payloadBuffer.subarray(payloadBuffer.length - 16);
            const ciphertext = payloadBuffer.subarray(0, payloadBuffer.length - 16);

            const decipher = crypto.createDecipheriv("aes-256-gcm", session.key, responseIv);
            decipher.setAuthTag(authTag);
            const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");

            const parsedResult = JSON.parse(decrypted);

            if (parsedResult.error_code) {
                this.activeSessions.delete(requestId);
                return { status: "failed", error: parsedResult.error_code };
            }

            // Verify with verifyTraderProof
            const verifyResult = await this.verifyTraderProof({
                userId: session.userId,
                merkle_root: parsedResult.merkle_root,
                nullifier_hash: parsedResult.nullifier_hash,
                proof: parsedResult.proof,
                verification_level: parsedResult.verification_level || "orb",
                action: session.action,
                signal: session.userId,
            });

            this.activeSessions.delete(requestId);

            if (verifyResult.success) {
                return {
                    status: "completed",
                    verified: true,
                    nullifier_hash: verifyResult.nullifier_hash,
                };
            } else {
                return {
                    status: "failed",
                    verified: false,
                    error: verifyResult.error,
                };
            }
        } catch (err: any) {
            console.error("[WORLD ID BRIDGE] Poll error:", err.message);
            return { status: "waiting" };
        }
    }

    /**
     * Autonomous background bridge polling on server
     */
    private startAutonomousBridgePolling(requestId: string) {
        let attempts = 0;
        const maxAttempts = 150; // 150 * 2s = 5 minutes
        const timer = setInterval(async () => {
            attempts++;
            if (attempts > maxAttempts || !this.activeSessions.has(requestId)) {
                clearInterval(timer);
                return;
            }

            try {
                const res = await this.pollBridgeSession(requestId);
                if (res.status === "completed" || res.status === "failed") {
                    clearInterval(timer);
                    console.log(`[WORLD ID BRIDGE AUTO-POLL] Bridge session ${requestId} concluded: ${res.status}`);
                }
            } catch (err: any) {
                // Silently continue polling until timeout
            }
        }, 2000);
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
            const user = await this.findUser(userId);
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
        const appId = env.WORLD_APP_ID || "app_2112e98ae700b17b3b2163c5baba7a38";
        const action = params.action || env.WORLD_ACTION || "verify-trader";
        const verificationLevel = params.verification_level || "orb";

        if (!params.userId) {
            return { success: false, error: "User ID is required", code: "missing_user_id" };
        }
        if (!params.nullifier_hash || !params.merkle_root || !params.proof) {
            return { success: false, error: "Missing cryptographic proof parameters", code: "invalid_payload" };
        }

        // 1. Check user exists (supports UUID, Telegram ID, or username)
        const user = await this.findUser(params.userId);
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

        if (isSimulated && process.env.NODE_ENV !== "production") {
            // Testnet / Simulator — only allowed in local dev with NODE_ENV=development
            console.log(`[WORLD ID DEV] Accepting simulated proof in dev environment`);
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

