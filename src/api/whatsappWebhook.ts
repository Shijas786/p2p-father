/**
 * WhatsApp Express Webhook for Evolution API
 * Listens for MESSAGES_UPSERT webhooks from Evolution API server.
 */

import { Router } from "express";
import { routeMessage } from "../whatsapp/router";
import type { WASocket, proto } from "@whiskeysockets/baileys";
import { getSock } from "../whatsapp/client";

export const whatsappWebhookRouter = Router();

whatsappWebhookRouter.post("/webhook", async (req, res) => {
    try {
        const body = req.body;
        const event = body.event || body.type;

        // Evolution API pushes messages via MESSAGES_UPSERT or SEND_MESSAGE
        if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
            const data = body.data;
            if (!data) return res.status(200).json({ status: "ignored" });

            const key = data.key || {};
            if (key.fromMe) return res.status(200).json({ status: "ignored_from_me" });

            const remoteJid = key.remoteJid || (data.sender ? `${data.sender}@s.whatsapp.net` : "");
            if (!remoteJid) return res.status(200).json({ status: "ignored_no_jid" });

            // Extract message content or button / list tap response
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

            // Construct normalized Baileys-like WebMessageInfo stub
            const normalizedMsg: proto.IWebMessageInfo = {
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

            let sock: WASocket | null = null;
            try {
                sock = getSock();
            } catch (_) {
                // Dummy socket stub if local Baileys socket is not initialized
                sock = {
                    user: { id: "917012751478:0@s.whatsapp.net" },
                    sendMessage: async () => {},
                } as any;
            }

            // Asynchronously route message through P2PFather router logic
            routeMessage(sock!, normalizedMsg).catch((err) => {
                console.error("[Evolution-Webhook] Error routing message:", err);
            });
        }

        res.status(200).json({ status: "ok" });
    } catch (err: any) {
        console.error("[Evolution-Webhook] Processing error:", err?.message);
        res.status(500).json({ error: "Webhook processing error" });
    }
});
