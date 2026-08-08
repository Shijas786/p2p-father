/**
 * P2PFather Evolution API Client
 * Manages outgoing REST API requests to Evolution API v1.8+/v2.x instances.
 */

import axios from "axios";
import { env } from "../config/env";

function getClient() {
    const baseURL = env.EVOLUTION_API_URL.replace(/\/$/, "");
    return axios.create({
        baseURL,
        headers: {
            "Content-Type": "application/json",
            apikey: env.EVOLUTION_API_KEY,
        },
        timeout: 15000,
    });
}

function formatJidToNumber(jid: string): string {
    return jid.split("@")[0].replace(/\D/g, "");
}

export const evolutionClient = {
    isConfigured(): boolean {
        return Boolean(env.EVOLUTION_API_URL && env.EVOLUTION_API_URL.trim().length > 0);
    },

    /** Send plain text message */
    async sendText(jid: string, text: string): Promise<any> {
        if (!this.isConfigured()) return null;
        const number = formatJidToNumber(jid);
        const client = getClient();
        const instance = env.EVOLUTION_INSTANCE_NAME || "p2pfather";

        const response = await client.post(`/message/sendText/${instance}`, {
            number,
            text,
            options: {
                delay: 500,
                presence: "composing",
            },
        });
        return response.data;
    },

    /** Send interactive quick_reply buttons (up to 3) */
    async sendButtons(
        jid: string,
        text: string,
        buttons: { id: string; label: string }[],
        footer = "P2PFather Escrow Exchange"
    ): Promise<any> {
        if (!this.isConfigured()) return null;
        const number = formatJidToNumber(jid);
        const client = getClient();
        const instance = env.EVOLUTION_INSTANCE_NAME || "p2pfather";

        // Evolution API expects button structure: [{ buttonId, buttonText: { displayText } }] or native flow
        const formattedButtons = buttons.slice(0, 3).map((b) => ({
            buttonId: b.id,
            buttonText: {
                displayText: b.label,
            },
            type: 1,
        }));

        try {
            const response = await client.post(`/message/sendButtons/${instance}`, {
                number,
                title: text,
                description: text,
                footer,
                buttons: formattedButtons,
            });
            return response.data;
        } catch (err: any) {
            console.warn("[Evolution-Client] sendButtons failed, falling back to sendText:", err?.message);
            // Fallback to formatted text over Evolution API if button endpoint throws
            const divider = "━━━━━━━━━━━━━━━━━━━━";
            const optionLines = buttons.map((b, i) => {
                const num = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"][i] ?? `${i + 1}.`;
                return `${num} ${b.label}`;
            });
            const fallbackText = `${text}\n\n${divider}\n💬 *Reply with a number to continue:*\n${optionLines.join("\n")}\n${divider}\n_${footer}_`;
            return this.sendText(jid, fallbackText);
        }
    },

    /** Send single_select interactive list picker */
    async sendList(
        jid: string,
        text: string,
        buttonText: string,
        sections: {
            title: string;
            rows: { id: string; title: string; description?: string }[];
        }[],
        footer = "P2PFather Escrow Exchange"
    ): Promise<any> {
        if (!this.isConfigured()) return null;
        const number = formatJidToNumber(jid);
        const client = getClient();
        const instance = env.EVOLUTION_INSTANCE_NAME || "p2pfather";

        const formattedSections = sections.map((s) => ({
            title: s.title,
            rows: s.rows.map((r) => ({
                title: r.title,
                description: r.description || "",
                rowId: r.id,
            })),
        }));

        try {
            const response = await client.post(`/message/sendList/${instance}`, {
                number,
                title: "P2PFather Exchange",
                description: text,
                buttonText,
                footer,
                sections: formattedSections,
            });
            return response.data;
        } catch (err: any) {
            console.warn("[Evolution-Client] sendList failed, falling back to sendText:", err?.message);
            const divider = "━━━━━━━━━━━━━━━━━━━━";
            let formattedText = `${text}\n\n${divider}\n📋 *${buttonText}*\n`;
            let rowCounter = 1;
            sections.forEach((s) => {
                formattedText += `\n📌 *${s.title}*\n`;
                s.rows.forEach((r) => {
                    const num = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"][rowCounter - 1] ?? `${rowCounter}.`;
                    formattedText += `${num} *${r.title}*${r.description ? ` — _${r.description}_` : ""}\n`;
                    rowCounter++;
                });
            });
            formattedText += `\n${divider}\n_${footer}_`;
            return this.sendText(jid, formattedText);
        }
    },

    /** Send media (image buffer / base64) */
    async sendMedia(
        jid: string,
        mediaBuffer: Buffer,
        fileName: string,
        caption?: string
    ): Promise<any> {
        if (!this.isConfigured()) return null;
        const number = formatJidToNumber(jid);
        const client = getClient();
        const instance = env.EVOLUTION_INSTANCE_NAME || "p2pfather";

        const base64Media = mediaBuffer.toString("base64");
        const response = await client.post(`/message/sendMedia/${instance}`, {
            number,
            media: base64Media,
            fileName,
            caption: caption || "",
            mediatype: "image",
        });
        return response.data;
    },

    /** Fetch current instance connection state from Evolution API */
    async fetchConnectionState(): Promise<{ connected: boolean; state: string }> {
        if (!this.isConfigured()) return { connected: false, state: "DISCONNECTED" };
        try {
            const client = getClient();
            const instance = env.EVOLUTION_INSTANCE_NAME || "p2pfather";
            const res = await client.get(`/instance/connectionState/${instance}`);
            const state = res.data?.instance?.state || res.data?.state || "close";
            return {
                connected: state === "open",
                state,
            };
        } catch (_) {
            return { connected: false, state: "DISCONNECTED" };
        }
    },

    /** Fetch QR code data URL from Evolution API if not connected */
    async fetchQrCode(): Promise<string | null> {
        if (!this.isConfigured()) return null;
        try {
            const client = getClient();
            const instance = env.EVOLUTION_INSTANCE_NAME || "p2pfather";
            const res = await client.get(`/instance/connect/${instance}`);
            return res.data?.base64 || res.data?.code || res.data?.qrcode?.base64 || null;
        } catch (_) {
            return null;
        }
    },
};
