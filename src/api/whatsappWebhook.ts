/**
 * WhatsApp Webhook Router
 * Receives messages from Hypermeow (Go bridge) and Evolution API,
 * routes them through the P2PFather message router.
 */

import { Router } from "express";
import { routeMessage } from "../whatsapp/router";
import type { WASocket, IWebMessageInfo } from "../whatsapp/types";

export const whatsappWebhookRouter = Router();

/** Stub socket — Hypermeow handles all outgoing sends via HTTP */
const stubSock: WASocket = {
    user: { id: "917012751478:0@s.whatsapp.net" },
    sendMessage: async () => {},
    groupMetadata: async () => ({ subject: "Unknown" }),
};

whatsappWebhookRouter.post("/webhook", async (req, res) => {
    try {
        const body = req.body;
        const event = body.event || body.type;

        // ── Hypermeow (Go bridge) webhook ──────────────────────────────────────
        // Payload: { jid, text, sender, pushName }
        if (body.jid && body.text !== undefined && !event) {
            const normalizedMsg: IWebMessageInfo = {
                key: {
                    remoteJid: body.jid,
                    fromMe: false,
                    id: `hm_${Date.now()}`,
                },
                message: {
                    conversation: body.text,
                    extendedTextMessage: { text: body.text },
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
