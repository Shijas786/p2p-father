import OpenAI from "openai";
import { env } from "../config/env";
import type { ParsedIntent } from "../types";
import axios from "axios";

const SYSTEM_PROMPT = `You are P2PFather Bot 🤖, a friendly and vigilant crypto P2P trading assistant.
Your mission is to help users trade crypto safely and easily.

🌍 **Persona**: Helpful, direct, and safety-first. Use emojis!
🗣️ **Languages**: Fluent in **English**, **Malayalam**, and **Manglish**. Reply in the same language the user uses.
🛡️ **Safety Rule**: ALWAYS remind sellers: "Check your BANK APP before releasing crypto. SMS can be fake." (In Malayalam: "Bank app check cheyyathe crypto release cheyyaruth!")
⛔ **Scope**: Only discuss P2P trading and wallet management. Do NOT discuss or quote crypto market prices, rates, or news — always redirect rate questions to the live orderbook (/ads).
   If off-topic, say: "Enikku P2P trading mathrame ariyu! 🚀" (I only know P2P trading).

📘 **Guidance**: If the user seems confused, explain how the bot works:
   - "Use /post to Buy/Sell"
   - "Use /trades to see active trades"
   - "Use /balance to check funds"

🧠 **Capabilities**:
1. CREATE_SELL_ORDER — User wants to sell crypto (e.g., "sell 50 USDC")
2. CREATE_BUY_ORDER — User wants to buy crypto (e.g., "buy 100 USDC")
3. VIEW_ORDERS — User wants to see market or listings (e.g., "show ads", "sell ads", "buy ads", "rates", "what rate", "enthu rate"). Params: { type: "sell" | "buy" | null }
4. MATCH_ORDER — User wants to accept a deal
5. CONFIRM_PAYMENT — Buyer says they paid
6. CONFIRM_RECEIPT — Seller says they received money
7. BRIDGE_TOKENS — User mentions bridging/cross-chain
8. CHECK_BALANCE — User asks about wallet/funds (e.g., "my balance", "kithaanu", "bakki", "how much usdt")
9. CHECK_STATUS — User asks "what happened to my trade?"
10. SEND_CRYPTO — User wants to send/transfer/withdraw crypto
11. DISPUTE — User mentions scam, fraud, or issue
12. HELP — User is confused or asks how to use the bot
13. PROFILE — User asks "who am I" or "my stats"
14. UNKNOWN — Nonsense or off-topic

⚠️ **Rate/Price questions**: If user asks about crypto prices, exchange rates, or market news — always return VIEW_ORDERS and tell them to check the live orderbook. Never make up numbers.

🔢 **Parameter Extraction**:
- "Selling 100 USDC at 88" → { token: "USDC", amount: 100, rate: 88, chain: "base" }
- "sell 10 usdt on bsc rate 93" → { token: "USDT", amount: 10, rate: 93, chain: "bsc" }
- "Need 5000 rupees worth" → { fiat: "INR", fiatAmount: 5000 }
- Default token is USDT. Default chain for USDT is "bsc", for USDC is "base".
- If user says "bsc" or "bnb chain", set chain to "bsc". If user says "base", set chain to "base".

Respond with JSON ONLY:
{
  "intent": "INTENT_NAME",
  "confidence": 0.0-1.0,
  "params": { ... },
  "response": "A short, friendly message or summary of what you are doing."
}
If the user just says "ads" or "live ads", set "type" to null to show both buy and sell ads.`;

class AIService {
    private client: OpenAI | null = null;

    private getClient(): OpenAI {
        if (!this.client) {
            const apiKey = env.OPENAI_API_KEY;
            if (!apiKey) {
                throw new Error("OpenAI API key not configured");
            }
            this.client = new OpenAI({ apiKey });
        }
        return this.client;
    }

    /**
     * Parse user's natural language message into a structured intent
     */
    async parseIntent(
        message: string,
        conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
    ): Promise<ParsedIntent> {
        try {
            const client = this.getClient();

            const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
                { role: "system", content: SYSTEM_PROMPT },
                ...(conversationHistory || []).slice(-6).map((m) => ({
                    role: m.role as "user" | "assistant",
                    content: m.content,
                })),
                { role: "user", content: message },
            ];

            const result = await client.chat.completions.create({
                model: env.OPENAI_MODEL || "gpt-5-nano",
                messages,
                response_format: { type: "json_object" },
                max_completion_tokens: 300,
                temperature: 0.3,
            });

            const content = result.choices[0]?.message?.content;
            if (!content) {
                return this.fallbackParse(message);
            }

            return JSON.parse(content) as ParsedIntent;
        } catch (error) {
            console.error("AI parse error:", error);
            return this.fallbackParse(message);
        }
    }

    /**
     * Analyze a payment screenshot using GPT-4o Vision
     */
    async analyzePaymentProof(
        imageUrl: string,
        expectedAmount: number,
        expectedReceiver: string
    ) {
        try {
            const client = this.getClient();

            // Fetch image data
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const imageData = Buffer.from(response.data).toString('base64');
            const dataUrl = `data:image/jpeg;base64,${imageData}`;

            const prompt = `You are a professional P2P payment verification expert for the Indian market. 
Analyze this UPI/bank payment screenshot (Common apps: GPay, PhonePe, Paytm).

**Extraction Guidelines**:
1. **UTR/Reference**: Look for "UTR", "Transaction ID", "Ref No", or "Google Transaction ID". It is typically a 12-digit number (e.g., 4056...).
2. **Amount**: Extract the exact INR amount. Look for "Paid", "Transfer to", or "Recipient gets".
3. **Recipient**: Extract the receiver's UPI ID or Name for verification.
4. **Status**: Identify if the status is "Success", "Completed", or similar. Ignore "Processing" or "Pending".

**Security Checks**:
- Check for signs of manipulation (font mismatch, alignment issues).
- Verify the details against the expected values provided.

Expected: ₹${expectedAmount} to ${expectedReceiver}.

Respond with JSON: { amount, receiver, status, utr, timestamp, amountMatch, receiverMatch, tamperingDetected, confidence, reasoning }`;

            const result = await client.chat.completions.create({
                model: env.OPENAI_MODEL || "gpt-5-nano",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            { type: "image_url", image_url: { url: dataUrl } },
                        ],
                    },
                ],
                response_format: { type: "json_object" },
                max_completion_tokens: 500,
            });

            const text = result.choices[0]?.message?.content;
            return JSON.parse(text || "{}");
        } catch (error) {
            console.error("AI vision error:", error);
            return { error: "Failed to analyze image", confidence: 0 };
        }
    }

    /**
     * AI-assisted dispute summary for Human Admins (Human Admin makes final decision)
     */
    async analyzeDispute(context: {
        tradeAmount: number;
        fiatAmount: number;
        buyerName: string;
        sellerName: string;
        buyerTrades: number;
        sellerTrades: number;
        buyerTrustScore: number;
        sellerTrustScore: number;
        reason: string;
        evidence: string[];
    }) {
        // Human admin always makes final decision
        return { recommendation: "needs_admin", confidence: 1.0, reasoning: "Human admin review required for financial dispute safety." };
    }

    /**
     * Generate a raw text response using OpenAI
     */
    async generateText(prompt: string, modelType: "flash" | "pro" = "flash"): Promise<string> {
        try {
            const client = this.getClient();
            const model = env.OPENAI_MODEL || "gpt-5-nano";

            const result = await client.chat.completions.create({
                model,
                messages: [{ role: "user", content: prompt }],
                max_completion_tokens: 1000,
            });

            return result.choices[0]?.message?.content || "";
        } catch (error) {
            console.error("AI generateText error:", error);
            return "";
        }
    }

    /**
     * Fallback: parse intent without AI using simple keyword matching
     */
    private fallbackParse(message: string): ParsedIntent {
        const lower = message.toLowerCase().trim();

        // Simple keyword matching
        if (/\b(sell|selling)\b/.test(lower)) {
            const amountMatch = lower.match(/(\d+(?:\.\d+)?)\s*(usdc|eth|usdt|bnb)?/);
            const rateMatch = lower.match(/(?:at|rate|@)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)/);
            return {
                intent: "CREATE_SELL_ORDER",
                confidence: 0.7,
                params: {
                    amount: amountMatch ? parseFloat(amountMatch[1]) : undefined,
                    token: amountMatch?.[2]?.toUpperCase() || "USDT",
                    rate: rateMatch ? parseFloat(rateMatch[1]) : undefined,
                },
                response: "Creating a sell order for you.",
            };
        }

        if (/\b(buy|buying|purchase)\b/.test(lower)) {
            const amountMatch = lower.match(/(\d+(?:\.\d+)?)\s*(usdc|eth|usdt|bnb)?/);
            return {
                intent: "CREATE_BUY_ORDER",
                confidence: 0.7,
                params: {
                    amount: amountMatch ? parseFloat(amountMatch[1]) : undefined,
                    token: amountMatch?.[2]?.toUpperCase() || "USDT",
                },
                response: "Let me find buy orders for you.",
            };
        }

        if (/\b(orders?|listings?|available|market|ads?)\b/.test(lower)) {
            const isSell = /\bsell\b/.test(lower);
            const isBuy = /\bbuy\b/.test(lower);
            return {
                intent: "VIEW_ORDERS",
                confidence: 0.7,
                params: {
                    type: isSell ? "sell" : (isBuy ? "buy" : undefined)
                },
                response: isSell ? "Here are the live sell ads." : (isBuy ? "Here are the live buy ads." : "Here are the available orders.")
            };
        }

        if (/\b(balance|how much|wallet)\b/.test(lower)) {
            return { intent: "CHECK_BALANCE", confidence: 0.7, params: {}, response: "Checking your balance." };
        }

        if (/\b(bridge|transfer|cross.?chain|move)\b/.test(lower)) {
            return { intent: "BRIDGE_TOKENS", confidence: 0.6, params: {}, response: "Let me help you bridge tokens." };
        }

        if (/\b(send)\b/.test(lower)) {
            const amountMatch = lower.match(/(\d+(?:\.\d+)?)\s*(usdc|eth|usdt|bnb)?/);
            return {
                intent: "SEND_CRYPTO",
                confidence: 0.7,
                params: {
                    amount: amountMatch ? parseFloat(amountMatch[1]) : undefined,
                    token: amountMatch?.[2]?.toUpperCase() || "USDT",
                },
                response: "Preparing to send crypto.",
            };
        }

        if (/\b(paid|sent|transferred|payment done)\b/.test(lower)) {
            return { intent: "CONFIRM_PAYMENT", confidence: 0.7, params: {}, response: "Marking payment as sent." };
        }

        if (/\b(received|got|confirm)\b/.test(lower)) {
            return { intent: "CONFIRM_RECEIPT", confidence: 0.6, params: {}, response: "Confirming receipt." };
        }

        if (/\b(dispute|problem|issue|scam|fraud)\b/.test(lower)) {
            return { intent: "DISPUTE", confidence: 0.7, params: {}, response: "Opening a dispute." };
        }

        if (/\b(help|how|what|faq)\b/.test(lower)) {
            return { intent: "HELP", confidence: 0.7, params: {}, response: "Here's how I can help." };
        }

        if (/\b(profile|stats|my|account)\b/.test(lower)) {
            return { intent: "PROFILE", confidence: 0.6, params: {}, response: "Here's your profile." };
        }

        if (/\b(news|market|rates?|price|update|today|happening|enthu rate|rate und|rate aano)\b/.test(lower)) {
            // Redirect to live orderbook — never make up rate numbers
            return { intent: "VIEW_ORDERS", confidence: 0.7, params: { type: null }, response: "Check the live P2P orderbook for the best rates! 📊" };
        }

        return {
            intent: "UNKNOWN",
            confidence: 0.0,
            params: {},
            response: "I didn't understand that. Try /help to see what I can do!",
        };
    }
}

export const ai = new AIService();
