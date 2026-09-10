/**
 * TypeScript REST Client for Hypermeow Go WhatsApp Bridge
 * Supports text, native quick_reply buttons, native single_select list pickers, and live QR retrieval.
 */

import axios from "axios";

const HYPERMEOW_URL = process.env.HYPERMEOW_URL || "http://localhost:8085";

export class HypermeowClient {
    private baseUrl: string;

    constructor(baseUrl = HYPERMEOW_URL) {
        this.baseUrl = baseUrl;
    }

    public isConfigured(): boolean {
        return Boolean(process.env.HYPERMEOW_URL);
    }

    public async checkHealth(): Promise<{ connected: boolean; engine?: string }> {
        try {
            const res = await axios.get(`${this.baseUrl}/health`, { timeout: 3000 });
            return {
                connected: Boolean(res.data?.connected),
                engine: res.data?.engine
            };
        } catch {
            return { connected: false };
        }
    }

    public async getQrCode(): Promise<string | null> {
        try {
            const res = await axios.get(`${this.baseUrl}/qr`, { timeout: 3000 });
            return res.data?.qr || null;
        } catch {
            return null;
        }
    }

    public async sendText(jid: string, text: string): Promise<boolean> {
        try {
            const res = await axios.post(
                `${this.baseUrl}/send-text`,
                { jid, text },
                { timeout: 8000 }
            );
            return res.status === 200;
        } catch (err: any) {
            console.error(`[HypermeowClient] SendText error for ${jid}:`, err?.message || err);
            return false;
        }
    }

    public async sendImage(jid: string, imageUrl: string, caption = ""): Promise<boolean> {
        try {
            const res = await axios.post(
                `${this.baseUrl}/send-image`,
                { jid, imageUrl, caption },
                { timeout: 12000 }
            );
            return res.status === 200;
        } catch (err: any) {
            console.error(`[HypermeowClient] SendImage error for ${jid}:`, err?.message || err);
            return false;
        }
    }

    public async sendButtons(
        jid: string,
        text: string,
        buttons: { id: string; label: string; url?: string; copyCode?: string }[],
        footer = "P2PFather Escrow Exchange"
    ): Promise<boolean> {
        try {
            const res = await axios.post(
                `${this.baseUrl}/send-buttons`,
                { jid, text, footer, buttons: buttons.slice(0, 3) },
                { timeout: 8000 }
            );
            return res.status === 200;
        } catch (err: any) {
            console.error(`[HypermeowClient] SendButtons error for ${jid}:`, err?.message || err);
            return false;
        }
    }

    public async sendList(
        jid: string,
        title: string,
        buttonText: string,
        sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]
    ): Promise<boolean> {
        try {
            const res = await axios.post(
                `${this.baseUrl}/send-list`,
                { jid, title, buttonText, sections },
                { timeout: 8000 }
            );
            return res.status === 200;
        } catch (err: any) {
            console.error(`[HypermeowClient] SendList error for ${jid}:`, err?.message || err);
            return false;
        }
    }

    public async deleteMessage(jid: string, sender: string, msgId: string): Promise<boolean> {
        try {
            const res = await axios.post(
                `${this.baseUrl}/delete-message`,
                { jid, sender, msgId },
                { timeout: 8000 }
            );
            return res.status === 200;
        } catch (err: any) {
            console.error(`[HypermeowClient] DeleteMessage error for ${jid}/${msgId}:`, err?.message || err);
            return false;
        }
    }

    public async getContactName(phone: string): Promise<string | null> {
        try {
            const res = await axios.get(`${this.baseUrl}/contact-info`, {
                params: { phone },
                timeout: 4000
            });
            return res.data?.name || null;
        } catch {
            return null;
        }
    }

    public async getGroupMetadata(jid: string): Promise<any> {
        try {
            const res = await axios.get(`${this.baseUrl}/group-info`, {
                params: { jid },
                timeout: 5000
            });
            return res.data || null;
        } catch (err: any) {
            console.warn(`[HypermeowClient] getGroupMetadata error for ${jid}:`, err?.message || err);
            return null;
        }
    }
}

export const hypermeowClient = new HypermeowClient();
