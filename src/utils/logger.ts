
import { Bot } from "grammy";
import { env } from "../config/env";

// Simple reliable logger
class Logger {
    private bot: any = null;

    // We initiate with bot instance to allow sending alerts
    init(botInstance: any) {
        this.bot = botInstance;
    }

    private timestamp() {
        return new Date().toISOString();
    }

    info(context: string, message: string, meta?: any) {
        console.log(`[${this.timestamp()}] [INFO] [${context}] ${message}`, meta ? JSON.stringify(meta) : '');
    }

    warn(context: string, message: string, meta?: any) {
        console.warn(`[${this.timestamp()}] [WARN] [${context}] ${message}`, meta ? JSON.stringify(meta) : '');
    }

    async error(context: string, message: string, error?: any) {
        const errorMsg = error?.message || error || 'Unknown error';
        const stack = error?.stack ? `\nStack: ${error.stack}` : '';

        console.error(`[${this.timestamp()}] [ERROR] [${context}] ${message}: ${errorMsg}`, stack);

        // Send alert to admins for critical errors
        if (this.bot && env.ADMIN_IDS.length > 0) {
            const alertMsg = `🚨 <b>CRITICAL ERROR</b>\n\n<b>Context:</b> ${context}\n<b>Message:</b> ${message}\n<b>Error:</b> ${errorMsg}`;

            for (const adminId of env.ADMIN_IDS) {
                try {
                    // Use a separate try-catch to ensure logging doesn't crash the app
                    await this.bot.api.sendMessage(adminId, alertMsg, { parse_mode: "HTML" }).catch(() => { });
                } catch (e) {
                    // Ignore failure to alert
                }
            }
        }
    }
}

export const logger = new Logger();
