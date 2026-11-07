/**
 * P2P Father — World App MiniKit & World ID API Router
 *
 * Exposes endpoints consumed by the World App Mini App webview & IDKit client.
 */

import { Router, Request, Response } from "express";
import { worldIdService } from "../services/worldId";
import { db } from "../db/client";

export const worldRouter = Router();

/**
 * GET /api/world/config
 * Exposes public World App ID and Action identifier for client-side MiniKit initialization.
 */
worldRouter.get("/config", (_req: Request, res: Response) => {
    res.json(worldIdService.getConfig());
});

/**
 * POST /api/world/initiate
 * Initializes a cryptographic Worldcoin bridge session and returns the universal link that opens World App directly.
 */
worldRouter.post("/initiate", async (req: Request, res: Response) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, error: "userId is required" });
        }

        const session = await worldIdService.initiateBridgeSession(userId);
        if (!session.success) {
            return res.status(500).json(session);
        }

        res.json(session);
    } catch (err: any) {
        console.error("[WORLD ROUTER] Initiate error:", err);
        res.status(500).json({ success: false, error: err.message || "Failed to initiate session" });
    }
});

/**
 * GET /api/world/poll/:requestId
 * Polls the bridge for completed proof from World App.
 */
worldRouter.get("/poll/:requestId", async (req: Request, res: Response) => {
    try {
        const requestId = req.params.requestId as string;
        if (!requestId) {
            return res.status(400).json({ status: "failed", error: "requestId is required" });
        }

        const pollResult = await worldIdService.pollBridgeSession(requestId);
        res.json(pollResult);
    } catch (err: any) {
        console.error("[WORLD ROUTER] Poll error:", err);
        res.status(500).json({ status: "failed", error: err.message || "Polling error" });
    }
});

/**
 * GET /api/world/status/:userId
 * Returns whether a trader has completed Proof-of-Human verification.
 */
worldRouter.get("/status/:userId", async (req: Request, res: Response) => {
    try {
        const userId = req.params.userId as string;
        if (!userId) {
            return res.status(400).json({ error: "userId parameter is required" });
        }
        const status = await worldIdService.getStatus(userId);
        res.json(status);
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to fetch World ID status" });
    }
});

/**
 * POST /api/world/verify
 * Receives the cryptographic Zero-Knowledge proof from MiniKit/IDKit and updates trader status.
 */
worldRouter.post("/verify", async (req: Request, res: Response) => {
    try {
        const { userId, merkle_root, nullifier_hash, proof, verification_level, action, signal } = req.body;

        if (!userId || !nullifier_hash || !proof || !merkle_root) {
            return res.status(400).json({
                success: false,
                error: "Missing required World ID proof parameters (userId, nullifier_hash, merkle_root, proof)",
                code: "invalid_payload"
            });
        }

        const result = await worldIdService.verifyTraderProof({
            userId,
            merkle_root,
            nullifier_hash,
            proof,
            verification_level: verification_level || "orb",
            action,
            signal,
        });

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json(result);
    } catch (err: any) {
        console.error("[WORLD ROUTER] Verification error:", err);
        res.status(500).json({
            success: false,
            error: err.message || "Internal server error during verification",
            code: "server_error"
        });
    }
});

/**
 * GET /api/world/orders
 * Returns sanitized active P2P ads for rendering inside the World App Mini App.
 */
worldRouter.get("/orders", async (_req: Request, res: Response) => {
    try {
        const orders = await db.getActiveOrders(undefined, undefined, 20);
        res.json({ orders: orders || [] });
    } catch (err: any) {
        console.error("[WORLD ROUTER] Orders error:", err);
        res.status(500).json({ error: "Failed to load active orders" });
    }
});
