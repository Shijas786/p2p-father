/**
 * WhatsApp Webhook Router
 * Receives messages from Hypermeow (Go bridge) and Evolution API,
 * routes them through the P2PFather message router.
 */

import { Router } from "express";
import { routeMessage } from "../whatsapp/router";
import type { WASocket, IWebMessageInfo } from "../whatsapp/types";
import { hypermeowClient } from "../whatsapp/hypermeowClient";
import { setBroadcastSock } from "../whatsapp/handlers/group";

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
    groupMetadata: async () => ({ subject: "P2PFather Group" }),
};

// Register stub socket for group live ad broadcasting
setBroadcastSock(stubSock);

whatsappWebhookRouter.post("/webhook", async (req, res) => {
    try {
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
                },
                pushName: body.pushName || "",
            };

            routeMessage(stubSock, normalizedMsg).catch((err) => {
                console.error("[Hypermeow-Webhook] Error routing message:", err);
            });

            return res.status(200).json({ status: "ok" });
        }

        // ── Evolution API webhook ──────────────────────────────────────────────
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
