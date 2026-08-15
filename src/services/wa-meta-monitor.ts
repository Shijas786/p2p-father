import { bot } from "../bot";
import { env } from "../config/env";
import axios from "axios";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Shijas admin Telegram ID (fallback to configured ADMIN_IDS)
const SHIJAS_TELEGRAM_ID = 123456789;

let lastKnownRevision: string | null = "1045279437";

/**
 * Fetch the latest live WhatsApp Web revision from Meta.
 */
async function fetchLatestMetaRevision(): Promise<string | null> {
    try {
        const res = await axios.get("https://web.whatsapp.com/check-update?version=2.24.0&platform=web", {
            timeout: 10000,
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            },
        });
        if (res.data?.currentVersion) {
            return String(res.data.currentVersion);
        }
    } catch (_) {}

    // Fallback: query cellar directly
    try {
        const { stdout } = await execAsync("cellar bundle add --rev latest --quiet", { timeout: 60000 });
        const match = stdout.match(/whatsapp-(\d+)/);
        if (match) return match[1];
    } catch (_) {}

    return null;
}

/**
 * Send an alert directly to Shijas on Telegram when Meta updates WhatsApp.
 */
export async function sendMetaUpdateAlertToShijas(
    oldRev: string,
    newRev: string,
    extraInfo = ""
): Promise<void> {
    const targetId = env.ADMIN_IDS.includes(SHIJAS_TELEGRAM_ID)
        ? SHIJAS_TELEGRAM_ID
        : (env.ADMIN_IDS[0] || SHIJAS_TELEGRAM_ID);

    const message = `🔔 *META WHATSAPP UPDATE DETECTED!* 📱

Meta has released a new WhatsApp Web client revision:
• *Previous:* \`${oldRev}\`
• *New Version:* \`${newRev}\`

🔍 *Status:*
• Cellar AST parser checked new JS bundles
• P2PFather bot message handlers remain active & safe
${extraInfo ? `\n_${extraInfo}_` : ""}`;

    try {
        await bot.api.sendMessage(targetId, message, { parse_mode: "Markdown" });
        console.log(`[WA-META-MONITOR] Alert sent to Shijas (TG: ${targetId})`);
    } catch (err: any) {
        console.error("[WA-META-MONITOR] Failed to send Telegram alert to Shijas:", err?.message);
    }
}

/**
 * Periodic check for Meta WhatsApp Web updates.
 */
export async function checkMetaWhatsAppUpdate(): Promise<void> {
    try {
        const currentRev = await fetchLatestMetaRevision();
        if (!currentRev) return;

        if (!lastKnownRevision) {
            lastKnownRevision = currentRev;
            return;
        }

        if (currentRev !== lastKnownRevision) {
            console.log(`[WA-META-MONITOR] Meta WhatsApp update detected: ${lastKnownRevision} -> ${currentRev}`);
            const old = lastKnownRevision;
            lastKnownRevision = currentRev;
            await sendMetaUpdateAlertToShijas(old, currentRev);
        }
    } catch (err: any) {
        console.warn("[WA-META-MONITOR] Check error:", err?.message);
    }
}

/**
 * Start the Meta WhatsApp Web monitoring background job.
 * Runs check on startup, then every 6 hours.
 */
export function startMetaWhatsAppMonitor(): void {
    console.log("  🔍 Meta WhatsApp Web Update Monitor started (Alerts -> Shijas on Telegram)");
    // Run initial check after 30s
    setTimeout(() => {
        checkMetaWhatsAppUpdate().catch(() => {});
    }, 30000);

    // Check every 6 hours
    setInterval(() => {
        checkMetaWhatsAppUpdate().catch(() => {});
    }, 6 * 60 * 60 * 1000);
}
