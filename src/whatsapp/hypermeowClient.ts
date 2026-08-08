/**
 * TypeScript REST Client for Hypermeow Go WhatsApp Bridge
 */

import axios from "axios";
import { env } from "../config/env";

const HYPERMEOW_URL = process.env.HYPERMEOW_URL || "http://localhost:8081";

export class HypermeowClient {
    private baseUrl: string;

    constructor(baseUrl = HYPERMEOW_URL) {
        this.baseUrl = baseUrl;
    }

    public isConfigured(): boolean {
        return Boolean(process.env.HYPERMEOW_URL);
    }

    public async checkHealth(): Promise<{ connected: boolean }> {
        try {
            const res = await axios.get(`${this.baseUrl}/health`, { timeout: 3000 });
            return { connected: Boolean(res.data?.connected) };
        } catch {
            return { connected: false };
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
}

export const hypermeowClient = new HypermeowClient();
