import { db } from "../db/client";
import { hypermeowClient } from "../whatsapp/hypermeowClient";

interface OtpEntry {
    phone: string;
    otp: string;
    expiresAt: number;
    attempts: number;
}

// In-memory OTP storage (phone -> OtpEntry)
const otpStore = new Map<string, OtpEntry>();

// Rate limit tracker (phone -> request timestamps)
const rateLimitStore = new Map<string, number[]>();

export class WhatsAppOtpService {
    /**
     * Standardizes phone number into international format without + or spaces
     * e.g. "+91 81379 56320" -> "919876543210"
     */
    cleanPhone(rawPhone: string): string {
        let cleaned = rawPhone.replace(/[^0-9]/g, "");
        if (cleaned.length === 10) {
            cleaned = "91" + cleaned;
        }
        return cleaned;
    }

    /**
     * Checks if the phone number has exceeded rate limits (max 5 OTPs per 10 minutes)
     */
    isRateLimited(phone: string): boolean {
        const now = Date.now();
        const timestamps = (rateLimitStore.get(phone) || []).filter(t => now - t < 10 * 60 * 1000);
        rateLimitStore.set(phone, timestamps);
        return timestamps.length >= 5;
    }

    /**
     * Generates a 6-digit OTP code, saves it in cache, and sends it via WhatsApp.
     */
    async sendOtp(rawPhone: string): Promise<{ success: boolean; message: string; expiresMinutes: number }> {
        const phone = this.cleanPhone(rawPhone);
        if (!phone || phone.length < 8) {
            return { success: false, message: "Invalid phone number format", expiresMinutes: 0 };
        }

        if (this.isRateLimited(phone)) {
            return { success: false, message: "Too many OTP requests. Please wait 10 minutes.", expiresMinutes: 0 };
        }

        // Generate 6-digit random numeric code
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 10 * 60 * 1000; // 10 mins

        otpStore.set(phone, {
            phone,
            otp,
            expiresAt,
            attempts: 0,
        });

        // Record rate limit timestamp
        const timestamps = rateLimitStore.get(phone) || [];
        timestamps.push(Date.now());
        rateLimitStore.set(phone, timestamps);

        // Send OTP via Hypermeow WhatsApp bridge
        const messageText = `🔑 *P2PFATHER WEB LOGIN CODE*\n\nYour login code is: *${otp}*\n\n_Valid for 10 minutes. Do not share this code with anyone._`;

        let sent = false;
        try {
            if (hypermeowClient.isConfigured()) {
                await hypermeowClient.sendText(`${phone}@s.whatsapp.net`, messageText);
                sent = true;
            }
        } catch (err: any) {
            console.error(`[WA-OTP] Failed to send OTP to ${phone} via Hypermeow:`, err?.message || err);
        }



        return {
            success: true,
            message: sent ? "OTP sent to your WhatsApp!" : "OTP generated. (Check WhatsApp)",
            expiresMinutes: 10,
        };
    }

    /**
     * Verifies 6-digit OTP code for a phone number.
     */
    verifyOtp(rawPhone: string, inputOtp: string): { valid: boolean; message: string } {
        const phone = this.cleanPhone(rawPhone);
        const entry = otpStore.get(phone);

        if (!entry) {
            return { valid: false, message: "No OTP request found for this phone number. Click 'Send Code' first." };
        }

        if (Date.now() > entry.expiresAt) {
            otpStore.delete(phone);
            return { valid: false, message: "OTP code expired. Please request a new code." };
        }

        if (entry.attempts >= 5) {
            otpStore.delete(phone);
            return { valid: false, message: "Too many incorrect attempts. Please request a new code." };
        }

        if (entry.otp !== inputOtp.trim()) {
            entry.attempts++;
            return { valid: false, message: "Invalid OTP code. Please check your WhatsApp and try again." };
        }

        // OTP verified successfully! Consume code so it cannot be reused
        otpStore.delete(phone);
        return { valid: true, message: "OTP verified successfully!" };
    }
}

export const waOtpService = new WhatsAppOtpService();
