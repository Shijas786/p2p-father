import OpenAI from "openai";
import { env } from "../config/env";
import type { ParsedIntent } from "../types";

const SYSTEM_PROMPT = `You are P2P Kerala Bot 🤖, a friendly and vigilant crypto P2P trading assistant.
Your mission is to help users trade crypto safely and easily.

🌍 **Persona**: Helpful, direct, and safety-first. Use emojis!
🗣️ **Languages**: Fluent in **English**, **Malayalam**, and **Manglish**. Reply in the same language the user uses.
🛡️ **Safety Rule**: ALWAYS remind sellers: "Check your BANK APP before releasing crypto. SMS can be fake." (In Malayalam: "Bank app check cheyyathe crypto release cheyyaruth!")
⛔ **Scope**: Only discuss P2P trading, crypto rates, and wallet management.
   If off-topic, say: "Enikku P2P trading mathrame ariyu! 🚀" (I only know P2P trading).

📘 **Guidance**: If the user seems confused, explain how the bot works:
   - "Use /newad to Buy/Sell"
   - "Use /mytrades to see active trades"
   - "Use /wallet to check funds"

🧠 **Capabilities**:

🧠 **Capabilities**:
1. CREATE_SELL_ORDER — User wants to sell crypto (e.g., "sell 50 USDC")
2. CREATE_BUY_ORDER — User wants to buy crypto (e.g., "buy 100 USDC")
3. VIEW_ORDERS — User wants to see market or listings (e.g., "show ads", "sell ads", "buy ads", "rates")
4. MATCH_ORDER — User wants to accept a deal
5. CONFIRM_PAYMENT — Buyer says they paid
6. CONFIRM_RECEIPT — Seller says they received money
7. BRIDGE_TOKENS — User mentions bridging/cross-chain
8. CHECK_BALANCE — User asks about wallet/funds
9. CHECK_STATUS — User asks "what happened to my trade?"
10. SEND_CRYPTO — User wants to send/transfer crypto
11. DISPUTE — User mentions scam, fraud, or issue
12. HELP — User is confused
13. PROFILE — User asks "who am I" or "my stats"
14. UNKNOWN — Nonsense or off-topic

🔢 **Parameter Extraction**:
- "Selling 100 USDC at 88" → { token: "USDC", amount: 100, rate: 88 }
- "Need 5000 rupees worth" → { fiat: "INR", fiatAmount: 5000 }

Respond with JSON ONLY:
{
  "intent": "INTENT_NAME",
  "confidence": 0.0-1.0,
  "params": { ... },
  "response": "A short, friendly message to the user confirming understanding."
}`;

class AIService {
    private client: OpenAI | null = null;

    private getClient(): OpenAI {
        if (!this.client) {
            if (!env.OPENAI_API_KEY) {
                throw new Error("OpenAI API key not configured");
            }
            this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
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

            const completion = await client.chat.completions.create({
                model: "gpt-4o-mini",
                messages,
                response_format: { type: "json_object" },
                temperature: 0.1,
                max_tokens: 500,
            });

            const content = completion.choices[0]?.message?.content;
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

            const completion = await client.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `You are a professional P2P payment verification expert for the Indian market. 
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
Respond with JSON: { amount, receiver, status, utr, timestamp, amountMatch, receiverMatch, tamperingDetected, confidence, reasoning }`,
                    },
                    {
                        role: "user",
                        content: [
                            { type: "image_url", image_url: { url: imageUrl } },
                            { type: "text", text: "Verify this payment proof." },
                        ],
                    },
                ],
                response_format: { type: "json_object" },
                max_tokens: 500,
            });

            return JSON.parse(completion.choices[0]?.message?.content || "{}");
        } catch (error) {
            console.error("AI vision error:", error);
            return { error: "Failed to analyze image", confidence: 0 };
        }
    }

    /**
     * AI-assisted dispute analysis
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
        try {
            const client = this.getClient();

            const completion = await client.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `You are a fair P2P dispute arbitrator. Analyze the evidence and recommend a resolution.
Consider timestamps, payment proofs, user history, trade terms.
Respond with JSON: { recommendation: "release_to_buyer" | "refund_to_seller" | "needs_admin", confidence, reasoning }`,
                    },
                    {
                        role: "user",
                        content: `Trade: ${context.tradeAmount} USDC / ₹${context.fiatAmount}
Buyer: ${context.buyerName} (${context.buyerTrades} trades, ${context.buyerTrustScore}% trust)
Seller: ${context.sellerName} (${context.sellerTrades} trades, ${context.sellerTrustScore}% trust)
Dispute reason: ${context.reason}
Evidence: ${context.evidence.join("\n")}`,
                    },
                ],
                response_format: { type: "json_object" },
            });

            return JSON.parse(completion.choices[0]?.message?.content || "{}");
        } catch (error) {
            console.error("AI dispute error:", error);
            return { recommendation: "needs_admin", confidence: 0, reasoning: "AI analysis failed" };
        }
    }

    /**
     * Fallback: parse intent without AI using simple keyword matching
     */
    private fallbackParse(message: string): ParsedIntent {
        const lower = message.toLowerCase().trim();

        // Simple keyword matching
        if (/\b(sell|selling)\b/.test(lower)) {
            const amountMatch = lower.match(/(\d+(?:\.\d+)?)\s*(usdc|eth|usdt)?/);
            const rateMatch = lower.match(/(?:at|rate|@)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)/);
            return {
                intent: "CREATE_SELL_ORDER",
                confidence: 0.7,
                params: {
                    amount: amountMatch ? parseFloat(amountMatch[1]) : undefined,
                    token: amountMatch?.[2]?.toUpperCase() || "USDC",
                    rate: rateMatch ? parseFloat(rateMatch[1]) : undefined,
                },
                response: "Creating a sell order for you.",
            };
        }

        if (/\b(buy|buying|purchase)\b/.test(lower)) {
            const amountMatch = lower.match(/(\d+(?:\.\d+)?)\s*(usdc|eth|usdt)?/);
            return {
                intent: "CREATE_BUY_ORDER",
                confidence: 0.7,
                params: {
                    amount: amountMatch ? parseFloat(amountMatch[1]) : undefined,
                    token: amountMatch?.[2]?.toUpperCase() || "USDC",
                },
                response: "Let me find buy orders for you.",
            };
        }

        if (/\b(orders?|listings?|available|market|ads?)\b/.test(lower)) {
            return { intent: "VIEW_ORDERS", confidence: 0.7, params: {}, response: "Here are the available orders." };
        }

        if (/\b(balance|how much|wallet)\b/.test(lower)) {
            return { intent: "CHECK_BALANCE", confidence: 0.7, params: {}, response: "Checking your balance." };
        }

        if (/\b(bridge|transfer|cross.?chain|move)\b/.test(lower)) {
            return { intent: "BRIDGE_TOKENS", confidence: 0.6, params: {}, response: "Let me help you bridge tokens." };
        }

        if (/\b(send)\b/.test(lower)) {
            const amountMatch = lower.match(/(\d+(?:\.\d+)?)\s*(usdc|eth|usdt)?/);
            return {
                intent: "SEND_CRYPTO",
                confidence: 0.7,
                params: {
                    amount: amountMatch ? parseFloat(amountMatch[1]) : undefined,
                    token: amountMatch?.[2]?.toUpperCase() || "USDC",
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

        return {
            intent: "UNKNOWN",
            confidence: 0.0,
            params: {},
            response: "I didn't understand that. Try /help to see what I can do!",
        };
    }
}

export const ai = new AIService();
