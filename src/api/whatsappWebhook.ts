/**
 * WhatsApp Webhook Router
 * Receives messages from Hypermeow (Go bridge) and Evolution API,
 * routes them through the P2PFather message router.
 */

import { Router } from "express";
import { routeMessage } from "../whatsapp/router";
import type { WASocket, IWebMessageInfo } from "../whatsapp/types";
import { hypermeowClient } from "../whatsapp/hypermeowClient";
import { setBroadcastSock, handleGroupJoin } from "../whatsapp/handlers/group";

export const whatsappWebhookRouter = Router();

/** Active stub socket connected to Hypermeow REST client */
const stubSock: WASocket = {
    user: { id: "917012751478:0@s.whatsapp.net" },
    sendMessage: async (jid: string, content: any) => {
        try {
            if (content.delete) {
                const targetKey = content.delete;
                const msgId = targetKey.id;
                const sender = targetKey.participant || "";
                if (msgId) {
                    console.log(`[WA-StubSocket] Executing message deletion for jid=${jid} msgId=${msgId} sender=${sender}`);
                    await hypermeowClient.deleteMessage(jid, sender, msgId);
                }
            } else if (content.image) {
                // Generate QR code URL or image URL for WhatsApp
                let imageUrl = "";
                if (typeof content.image === "string") {
                    imageUrl = content.image;
                } else if (Buffer.isBuffer(content.image)) {
                    // Buffer image (e.g. QRCode buffer) — convert to data URI or fallback URL
                    const base64 = content.image.toString("base64");
                    imageUrl = `data:image/png;base64,${base64}`;
                }
                const caption = content.caption || "";
                if (imageUrl) {
                    await hypermeowClient.sendImage(jid, imageUrl, caption);
                }
            } else if (content.text) {
                await hypermeowClient.sendText(jid, content.text);
            }
        } catch (err: any) {
            console.error(`[WA-StubSocket] Error sending message to ${jid}:`, err?.message || err);
        }
    },
    groupMetadata: async (jid?: string) => {
        if (jid && hypermeowClient.isConfigured()) {
            const meta = await hypermeowClient.getGroupMetadata(jid);
            if (meta && meta.participants) {
                return {
                    subject: meta.topic || "P2PFather Group",
                    participants: meta.participants.map((p: any) => ({
                        id: p.jid,
                        jid: p.jid,
                        lid: p.lid,
                        admin: (p.isAdmin || p.isSuperAdmin) ? "admin" : null,
                        isAdmin: Boolean(p.isAdmin || p.isSuperAdmin),
                    })),
                };
            }
        }
        return { subject: "P2PFather Group", participants: [] };
    },
};

// Register stub socket for group live ad broadcasting
setBroadcastSock(stubSock);

whatsappWebhookRouter.post("/webhook", async (req, res) => {
    try {
        // 🛡️ Security Guard: Only allow local calls from Hypermeow or requests with valid webhook secret
        const incomingSecret = (req.headers["x-webhook-secret"] as string) || (req.query.secret as string);
        const configuredSecret = process.env.INTERNAL_WEBHOOK_SECRET || process.env.WA_ADMIN_SECRET;

        const forwardedFor = req.headers["x-forwarded-for"];
        const remoteIp = req.socket.remoteAddress || "";
        const isLocalhost = (remoteIp === "127.0.0.1" || remoteIp === "::1" || remoteIp === "::ffff:127.0.0.1") && !forwardedFor;

        const isAuthorized = (configuredSecret && incomingSecret === configuredSecret) || isLocalhost;
        if (!isAuthorized) {
            console.warn(`[WA-Webhook] ⛔ Blocked unauthorized webhook call from IP=${remoteIp}, forwardedFor=${forwardedFor}`);
            return res.status(403).json({ error: "Forbidden: Unauthorized webhook source" });
        }

        const body = req.body;
        const event = body.event || body.type;

        // ── Hypermeow (Go bridge) webhook ──────────────────────────────────────
        // Payload: { jid, text, sender, pushName, audioBase64, msgId }
        if (body.jid && body.text !== undefined && !event) {
            let messageText = body.text;

            // If incoming message is a voice note with audioBase64
            if (body.audioBase64 || body.text === "[VOICE_NOTE]") {
                try {
                    const audioBuffer = Buffer.from(body.audioBase64, "base64");
                    const { waAi } = await import("../services/wa-ai");
                    const transcribed = await waAi.transcribeVoice(audioBuffer);
                    if (transcribed) {
                        messageText = transcribed;
                        console.log(`[WA-Webhook] 🎙️ Transcribed WhatsApp voice note for ${body.jid}: "${transcribed}"`);
                    }
                } catch (err: any) {
                    console.error("[WA-Webhook] Voice note transcription failed:", err?.message || err);
                }
            }

            const normalizedMsg: IWebMessageInfo = {
                key: {
                    remoteJid: body.jid,
                    fromMe: false,
                    id: body.msgId || `hm_${Date.now()}`,
                    participant: body.sender || undefined,
                },
                message: {
                    conversation: messageText,
                    extendedTextMessage: { text: messageText },
                    ...(body.imageBase64 ? { imageMessage: { url: "base64" } } : {}),
                },
                pushName: body.pushName || "",
                ...(body.imageBase64 ? { imageBase64: body.imageBase64 } : {}),
            } as any;

            if (body.isAdmin !== undefined) {
                (normalizedMsg.key as any).isAdmin = Boolean(body.isAdmin);
            }

            routeMessage(stubSock, normalizedMsg).catch((err) => {
                console.error("[Hypermeow-Webhook] Error routing message:", err);
            });

            return res.status(200).json({ status: "ok" });
        }

        // ── Hypermeow Group Participant Join event ────────────────────────────
        if (event === "group_participant_join") {
            const groupJid = body.groupJid;
            const participants = body.participants || [];
            if (groupJid && participants.length > 0) {
                handleGroupJoin(stubSock, groupJid, participants).catch((err) => {
                    console.error("[Hypermeow-Webhook] Error handling group join:", err);
                });
            }
            return res.status(200).json({ status: "ok" });
        }

        // ── Evolution API webhook ──────────────────────────────────────────────
        if (event === "group-participants.update" || event === "GROUP_PARTICIPANTS_UPDATE") {
            const data = body.data || {};
            const groupJid = data.id || data.jid;
            const action = data.action;
            const participants = data.participants || [];
            if (groupJid && (action === "add" || action === "join") && participants.length > 0) {
                handleGroupJoin(stubSock, groupJid, participants).catch((err) => {
                    console.error("[Evolution-Webhook] Error handling group join:", err);
                });
            }
            return res.status(200).json({ status: "ok" });
        }

        if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
            const data = body.data;
            if (!data) return res.status(200).json({ status: "ignored" });

            const key = data.key || {};
            if (key.fromMe) return res.status(200).json({ status: "ignored_from_me" });

            const remoteJid = key.remoteJid || (data.sender ? `${data.sender}@s.whatsapp.net` : "");
            if (!remoteJid) return res.status(200).json({ status: "ignored_no_jid" });

            const message = data.message || {};
            const buttonReply =
                data.buttonsResponseMessage?.selectedButtonId ||
                message.buttonsResponseMessage?.selectedButtonId ||
                message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
                data.listResponseMessage?.singleSelectReply?.selectedRowId ||
                message.listResponseMessage?.singleSelectReply?.selectedRowId;

            const text =
                buttonReply ||
                data.body ||
                message.conversation ||
                message.extendedTextMessage?.text ||
                "";

            const normalizedMsg: IWebMessageInfo = {
                key: {
                    remoteJid,
                    fromMe: false,
                    id: key.id || `evo_${Date.now()}`,
                    participant: key.participant || data.participant,
                },
                message: {
                    conversation: text,
                    extendedTextMessage: { text },
                    ...(buttonReply ? { buttonsResponseMessage: { selectedButtonId: buttonReply } } : {}),
                },
            };

            routeMessage(stubSock, normalizedMsg).catch((err) => {
                console.error("[Evolution-Webhook] Error routing message:", err);
            });
        }

        res.status(200).json({ status: "ok" });
    } catch (err: any) {
        console.error("[Webhook] Processing error:", err?.message);
        res.status(500).json({ error: "Webhook processing error" });
    }
});
