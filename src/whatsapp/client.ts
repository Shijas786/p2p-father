/**
 * P2PFather WhatsApp Client
 * Uses Baileys (@whiskeysockets/baileys) for WhatsApp Web protocol.
 */

import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import type { WASocket } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import path from "path";
import pino from "pino";
import { routeMessage } from "./router";

const AUTH_DIR = path.join(process.cwd(), "whatsapp_auth_keys");

const logger = pino({ level: process.env.NODE_ENV === "development" ? "info" : "silent" });

let sock: WASocket | null = null;
let latestQr: string | null = null;
let isConnected = false;

export function getSock(): WASocket {
    if (!sock) throw new Error("[WA] WhatsApp socket not initialized yet");
    return sock;
}

export function getLatestQr(): string | null {
    return latestQr;
}

export function isWaConnected(): boolean {
    return isConnected;
}

export async function initWhatsApp(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`  📱 Baileys version: ${version.join(".")}`);

    sock = makeWASocket({
        version,
        logger,
        auth: state,
        getMessage: async () => undefined,
        browser: ["P2PFather Bot", "Chrome", "120.0.0"],
        markOnlineOnConnect: false,
        syncFullHistory: false,
    });

    // ── Connection events ─────────────────────────────────────────────────────
    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            latestQr = qr;
            isConnected = false;
            // Dynamic import to avoid loading qrcode-terminal unless needed
            const qrcode = await import("qrcode-terminal");
            const qrcodeTerminal = qrcode.default || qrcode;
            console.log("\n  📲 Scan the QR code below with your WhatsApp bot account:\n");
            qrcodeTerminal.generate(qr, { small: true });
            console.log("\n  ⏳ Waiting for scan...\n");
        }

        if (connection === "close") {
            isConnected = false;
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`  ⚠️  WhatsApp disconnected (code: ${statusCode}). Reconnect: ${shouldReconnect}`);
            if (shouldReconnect) {
                await new Promise((r) => setTimeout(r, 5000));
                console.log("  🔄 Reconnecting WhatsApp...");
                initWhatsApp();
            } else {
                console.log("  ❌ WhatsApp logged out. Clearing auth keys and auto-generating fresh QR...");
                try {
                    const fs = await import("fs");
                    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                } catch (_) {}
                await new Promise((r) => setTimeout(r, 2000));
                initWhatsApp();
            }
        }

        if (connection === "open") {
            latestQr = null;
            isConnected = true;
            const me = sock!.user;
            console.log(`  ✅ WhatsApp connected as: ${me?.name ?? "Unknown"} (+${me?.id.split(":")[0]})`);
        }
    });

    // ── Persist credentials ───────────────────────────────────────────────────
    sock.ev.on("creds.update", saveCreds);

    // ── Route incoming messages ───────────────────────────────────────────────
    sock.ev.on("messages.upsert", async (m) => {
        for (const msg of m.messages) {
            if (!msg.message || msg.key?.fromMe) continue;
            try {
                await routeMessage(sock!, msg);
            } catch (err) {
                console.error("[WA] Error routing message:", err);
            }
        }
    });
}
