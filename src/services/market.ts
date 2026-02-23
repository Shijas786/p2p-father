import axios from "axios";
import { ai } from "./ai";

class MarketService {
    private readonly NEWS_API = "https://min-api.cryptocompare.com/data/v2/news/?lang=EN";
    private readonly PRICE_API = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin,usd-coin&vs_currencies=usd&include_24hr_change=true";

    /**
     * Fetch latest news and prices and format them into a catchy digest using AI
     */
    async getMarketDigest(userQuery?: string): Promise<string> {
        try {
            // Fetch both in parallel
            const [newsRes, priceRes] = await Promise.all([
                axios.get(this.NEWS_API).catch(() => ({ data: { Data: [] } })),
                axios.get(this.PRICE_API).catch(() => ({ data: {} }))
            ]);

            const headlines = (newsRes.data.Data || []).slice(0, 10).map((n: any) => n.title);
            const prices = priceRes.data;

            // Extract prices safely
            const btc = prices.bitcoin?.usd || 0;
            const eth = prices.ethereum?.usd || 0;
            const bnb = prices.binancecoin?.usd || 0;

            const btcChange = prices.bitcoin?.usd_24h_change || 0;
            const ethChange = prices.ethereum?.usd_24h_change || 0;
            const bnbChange = prices.binancecoin?.usd_24h_change || 0;

            const basePrompt = `You are P2PFather Bot 🤖. 
            
Current Rates (USD):
- 💰 BTC: $${btc.toLocaleString()} (${btcChange > 0 ? '🟢 +' : '🔴 '}${btcChange.toFixed(2)}%)
- 💰 ETH: $${eth.toLocaleString()} (${ethChange > 0 ? '🟢 +' : '🔴 '}${ethChange.toFixed(2)}%)
- 💰 BNB: $${bnb.toLocaleString()} (${bnbChange > 0 ? '🟢 +' : '🔴 '}${bnbChange.toFixed(2)}%)

Top Crypto Headlines:
${headlines.length > 0
                    ? headlines.map((h: string, i: number) => `${i + 1}. ${h}`).join("\n")
                    : "No major updates in the last few hours."}`;

            const instructionPrompt = userQuery
                ? `The user asked: "${userQuery}". 
                   Using the data above, answer their question directly in English/Manglish. 
                   If they asked for a specific price, give it to them clearly in USD.
                   You can still provide a bit of context or other prices if relevant, but prioritize answering the user.
                   Use bold headings and clean Telegram Markdown.
                   Add a "Father's Take" in Malayalam/Manglish at the end.`
                : `Create a professional, catchy "Daily Crypto Digest" for your users.
                   1. Use bold headings and clean Telegram Markdown formatting.
                   2. Provide a short, easy-to-read summary of the top news.
                   3. Add a section called "Father's Take" in **Malayalam or Manglish** giving a quick vibe check of the market.
                   4. End with "🚀 Stay active on /market for live updates.\n⚡ P2PFather - Trade Safe."`;

            const digest = await ai.generateText(`${basePrompt}\n\n**Instructions**:\n${instructionPrompt}\n\n**CRITICAL**: You MUST return a non-empty text response. Even if news is thin, summarize the prices and market mood.`, "flash");

            if (!digest || digest.trim().length < 10) {
                console.warn("AI returned empty or too short digest, using fallback.");
                return this.getHardcodedFallback(btc, eth, bnb);
            }

            return digest;
        } catch (error) {
            console.error("Market Digest Error:", error);
            return "⚠️ *Market Update Service Offline*\n\nEnikku ippo market updates edukhan pattunnilla. Kurachu kazhignu nokku! \n\nCheck /start to continue trading.";
        }
    }

    private getHardcodedFallback(btc: number, eth: number, bnb: number): string {
        return `📊 *P2PFather Quick Market Check*\n\n` +
            `💰 *BTC:* $${btc.toLocaleString()}\n` +
            `💰 *ETH:* $${eth.toLocaleString()}\n` +
            `💰 *BNB:* $${bnb.toLocaleString()}\n\n` +
            `AI news service is currently busy. Trading is still active! 🚀\n\n` +
            `⚡ P2PFather - Trade Safe.`;
    }
}

export const market = new MarketService();
