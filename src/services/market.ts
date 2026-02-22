import axios from "axios";
import { ai } from "./ai";

class MarketService {
    private readonly NEWS_API = "https://min-api.cryptocompare.com/data/v2/news/?lang=EN";
    private readonly PRICE_API = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin,usd-coin&vs_currencies=inr&include_24hr_change=true";

    /**
     * Fetch latest news and prices and format them into a catchy digest using AI
     */
    async getMarketDigest(): Promise<string> {
        try {
            // Fetch both in parallel
            const [newsRes, priceRes] = await Promise.all([
                axios.get(this.NEWS_API).catch(() => ({ data: { Data: [] } })),
                axios.get(this.PRICE_API).catch(() => ({ data: {} }))
            ]);

            const headlines = (newsRes.data.Data || []).slice(0, 10).map((n: any) => n.title);
            const prices = priceRes.data;

            // Extract prices safely
            const btc = prices.bitcoin?.inr || 0;
            const eth = prices.ethereum?.inr || 0;
            const bnb = prices.binancecoin?.inr || 0;
            const usdc = prices['usd-coin']?.inr || 0;

            const btcChange = prices.bitcoin?.inr_24h_change || 0;
            const ethChange = prices.ethereum?.inr_24h_change || 0;
            const bnbChange = prices.binancecoin?.inr_24h_change || 0;

            const prompt = `You are P2PFather Bot 🤖. Create a professional, catchy "Daily Crypto Digest" for your users.
            
Current Rates (INR):
- 💰 BTC: ₹${btc.toLocaleString()} (${btcChange > 0 ? '🟢 +' : '🔴 '}${btcChange.toFixed(2)}%)
- 💰 ETH: ₹${eth.toLocaleString()} (${ethChange > 0 ? '🟢 +' : '🔴 '}${ethChange.toFixed(2)}%)
- 💰 BNB: ₹${bnb.toLocaleString()} (${bnbChange > 0 ? '🟢 +' : '🔴 '}${bnbChange.toFixed(2)}%)
- 💰 USDC: ₹${usdc.toLocaleString()}

Top Crypto Headlines:
${headlines.length > 0
                    ? headlines.map((h: string, i: number) => `${i + 1}. ${h}`).join("\n")
                    : "No major updates in the last few hours."}

**Instructions**:
1. Use bold headings and clean Telegram Markdown formatting.
2. Provide a short, easy-to-read summary of the top news.
3. Add a section called "Father's Take" at the end in **Malayalam or Manglish** giving a quick vibe check of the market (is it bullish? bearish? good time to trade?).
4. Keep it friendly and professional.
5. End with "🚀 Stay active on /market for live updates.\n⚡ P2PFather - Trade Safe."`;

            const digest = await ai.generateText(prompt, "flash");

            if (!digest) {
                return this.getHardcodedFallback(btc, eth, bnb, usdc);
            }

            return digest;
        } catch (error) {
            console.error("Market Digest Error:", error);
            return "⚠️ *Market Update Service Offline*\n\nEnikku ippo market updates edukhan pattunnilla. Kurachu kazhignu nokku! \n\nCheck /start to continue trading.";
        }
    }

    private getHardcodedFallback(btc: number, eth: number, bnb: number, usdc: number): string {
        return `📊 *P2PFather Quick Market Check*\n\n` +
            `💰 *BTC:* ₹${btc.toLocaleString()}\n` +
            `💰 *ETH:* ₹${eth.toLocaleString()}\n` +
            `💰 *BNB:* ₹${bnb.toLocaleString()}\n` +
            `💰 *USDC:* ₹${usdc.toLocaleString()}\n\n` +
            `News service is currently busy. Trading is still active! 🚀\n\n` +
            `⚡ P2PFather - Trade Safe.`;
    }
}

export const market = new MarketService();
