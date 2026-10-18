/**
 * Chart Service for P2PFather
 * Fetches real-time candlestick data from Binance Public API
 * for any supported cryptocurrency (BTC, ETH, SOL, BNB, DOGE, PEPE, etc.)
 * across multiple timeframes (15m, 1h, 4h, 1d, 1w)
 * and generates a high-resolution dark-mode candlestick chart.
 */

import axios from "axios";

interface CandlestickData {
    x: number;
    o: number;
    h: number;
    l: number;
    c: number;
}

export interface ChartResult {
    symbol: string;
    pair: string;
    timeframe: string;
    imageUrl: string;
    currentPrice: number;
    priceChange: number;
    high24h: number;
    low24h: number;
    caption: string;
}

export interface TimeframeConfig {
    interval: string;
    limit: number;
    label: string;
    unit: "hour" | "day" | "month";
}

export const TIMEFRAMES: Record<string, TimeframeConfig> = {
    "15m": { interval: "15m", limit: 32, label: "15M (Scalp)", unit: "hour" },
    "1h":  { interval: "1h",  limit: 24, label: "24H (1H)", unit: "hour" },
    "24h": { interval: "1h",  limit: 24, label: "24H (1H)", unit: "hour" },
    "4h":  { interval: "4h",  limit: 30, label: "5D (4H)", unit: "day" },
    "1d":  { interval: "1d",  limit: 30, label: "30D (Daily)", unit: "day" },
    "30d": { interval: "1d",  limit: 30, label: "30D (Daily)", unit: "day" },
    "7d":  { interval: "4h",  limit: 42, label: "7D (4H)", unit: "day" },
    "1w":  { interval: "1w",  limit: 26, label: "6M (Weekly)", unit: "month" },
};

// Common coin name to ticker alias mapping
const COIN_ALIASES: Record<string, string> = {
    bitcoin: "BTC",
    btc: "BTC",
    ethereum: "ETH",
    ether: "ETH",
    eth: "ETH",
    solana: "SOL",
    sol: "SOL",
    binance: "BNB",
    bnb: "BNB",
    doge: "DOGE",
    dogecoin: "DOGE",
    xrp: "XRP",
    ripple: "XRP",
    ada: "ADA",
    cardano: "ADA",
    ton: "TON",
    toncoin: "TON",
    sui: "SUI",
    pepe: "PEPE",
    shib: "SHIB",
    shiba: "SHIB",
    avax: "AVAX",
    avalanche: "AVAX",
    near: "NEAR",
    link: "LINK",
    chainlink: "LINK",
    dot: "DOT",
    polkadot: "DOT",
    ltc: "LTC",
    litecoin: "LTC",
    bch: "BCH",
    trx: "TRX",
    tron: "TRX",
    matic: "POL",
    pol: "POL",
    polygon: "POL",
    apt: "APT",
    aptos: "APT",
    arb: "ARB",
    arbitrum: "ARB",
    op: "OP",
    optimism: "OP",
    kas: "KAS",
    kaspa: "KAS",
    fet: "FET",
    render: "RENDER",
    rndr: "RENDER"
};

// 60-second in-memory cache per trading pair & timeframe
interface CacheEntry {
    result: ChartResult;
    timestamp: number;
}
const chartCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

function formatPrice(val: number): string {
    if (val >= 1000) {
        return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (val >= 1) {
        return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    if (val >= 0.0001) {
        return val.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    }
    return val.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 8 });
}

export class ChartService {
    private readonly BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";
    private readonly QUICKCHART_URL = "https://quickchart.io/chart/create";

    /**
     * Resolves user input into a standard coin ticker and Binance USDT pair.
     */
    public resolveCoin(rawInput?: string): { coin: string; pair: string } {
        if (!rawInput || rawInput.trim().length === 0) {
            return { coin: "BTC", pair: "BTCUSDT" };
        }

        const cleaned = rawInput.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        const coin = COIN_ALIASES[cleaned] || cleaned.toUpperCase();

        const pair = coin.endsWith("USDT") ? coin : `${coin}USDT`;
        const normalizedCoin = pair.replace("USDT", "");

        return { coin: normalizedCoin, pair };
    }

    /**
     * Extracts timeframe from message text (e.g. "15m", "1h", "4h", "1d", "1w", "24h").
     * Defaults to "24h" if not found.
     */
    public extractTimeframeFromText(text: string): string {
        const match = text.toLowerCase().match(/\b(15m|1h|24h|4h|1d|7d|30d|1w)\b/);
        return match ? match[1] : "24h";
    }

    /**
     * Extracts coin ticker from message text (e.g. "@bot eth 4h chart", "sol price chart", "/chart doge 1d").
     */
    public extractCoinFromText(text: string): string {
        const clean = text
            .replace(/@\S+/g, "") // strip mentions like @917012751478 or @bot
            .replace(/\b(15m|1h|24h|4h|1d|7d|30d|1w)\b/gi, "") // strip timeframe keywords
            .replace(/[\/!?.,#*]/g, " ") // normalize punctuation and slash
            .trim();

        // 1. Check patterns like "chart of sol" or "chart sol"
        const chartFirstMatch = clean.match(/\bchart\s+(?:of\s+)?([a-zA-Z0-9]{2,10})\b/i);
        if (chartFirstMatch && chartFirstMatch[1]) {
            return chartFirstMatch[1];
        }

        // 2. Check patterns like "sol chart" or "solana price chart"
        const chartLastMatch = clean.match(/\b([a-zA-Z0-9]{2,10})\s+(?:price\s+)?chart\b/i);
        if (chartLastMatch && chartLastMatch[1]) {
            return chartLastMatch[1];
        }

        // 3. Simple standalone ticker if "chart" is elsewhere (e.g. "/chart ETH")
        const words = clean.split(/\s+/).filter(w => w.toLowerCase() !== "chart" && w.toLowerCase() !== "price");
        if (words.length > 0 && words[0].length >= 2 && words[0].length <= 10) {
            return words[0];
        }

        // Default to BTC if no coin specified
        return "BTC";
    }

    /**
     * Generates a candlestick chart image for any coin on Binance across supported timeframes.
     */
    public async getCandlestickChart(
        coinInput = "BTC",
        timeframeInput = "24h",
        forceFresh = false
    ): Promise<{ result?: ChartResult; notFound?: boolean; error?: string }> {
        const { coin, pair } = this.resolveCoin(coinInput);
        const tfKey = timeframeInput.toLowerCase();
        const tf = TIMEFRAMES[tfKey] || TIMEFRAMES["24h"];
        const now = Date.now();

        // Cache key per pair + timeframe
        const cacheKey = `${pair}_${tfKey}`;
        const cached = chartCache.get(cacheKey);
        if (!forceFresh && cached && (now - cached.timestamp) < CACHE_TTL_MS) {
            return { result: cached.result };
        }

        try {
            // 1. Fetch live candles from Binance for the chosen interval
            const res = await axios.get(this.BINANCE_KLINES_URL, {
                params: {
                    symbol: pair,
                    interval: tf.interval,
                    limit: tf.limit
                },
                timeout: 5000
            });

            const rawData = res.data;
            if (!Array.isArray(rawData) || rawData.length === 0) {
                console.warn(`[ChartService] Empty kline data from Binance for ${pair} (${tf.interval})`);
                return { error: `No market data available for ${coin}.` };
            }

            let periodHigh = -Infinity;
            let periodLow = Infinity;

            const candlestickData: CandlestickData[] = rawData.map((c: any) => {
                const o = parseFloat(c[1]);
                const h = parseFloat(c[2]);
                const l = parseFloat(c[3]);
                const cl = parseFloat(c[4]);
                if (h > periodHigh) periodHigh = h;
                if (l < periodLow) periodLow = l;
                return { x: c[0], o, h, l, c: cl };
            });

            const lastCandle = candlestickData[candlestickData.length - 1];
            const firstCandle = candlestickData[0];
            const currentPrice = lastCandle.c;
            const priceChange = ((currentPrice - firstCandle.o) / firstCandle.o) * 100;
            const isUp = priceChange >= 0;

            const formattedPrice = formatPrice(currentPrice);
            const formattedHigh = formatPrice(periodHigh);
            const formattedLow = formatPrice(periodLow);

            // 2. Configure dark-mode candlestick chart (Style A)
            const chartConfig = {
                type: "candlestick",
                data: {
                    datasets: [{
                        label: `${coin}/USDT`,
                        data: candlestickData,
                        color: {
                            up: "#0ecb81",       // Binance Green
                            down: "#f6465d",     // Binance Red
                            unchanged: "#848e9c"
                        }
                    }]
                },
                options: {
                    plugins: {
                        legend: { display: false },
                        title: {
                            display: true,
                            text: `Binance • ${coin}/USDT ${tf.label} • $${formattedPrice} (${isUp ? "+" : ""}${priceChange.toFixed(2)}%)`,
                            font: { size: 20, weight: "bold" },
                            color: "#f0b90b", // Binance Yellow
                            padding: { top: 10, bottom: 4 }
                        },
                        subtitle: {
                            display: true,
                            text: `High: $${formattedHigh}  |  Low: $${formattedLow}  •  ⚡ P2PFather`,
                            font: { size: 12 },
                            color: "#848e9c",
                            padding: { bottom: 12 }
                        }
                    },
                    scales: {
                        x: {
                            type: "time",
                            time: { unit: tf.unit },
                            grid: { color: "rgba(255, 255, 255, 0.05)" },
                            ticks: { color: "#848e9c", font: { size: 11 } }
                        },
                        y: {
                            position: "right",
                            grid: { color: "rgba(255, 255, 255, 0.05)" },
                            ticks: { color: "#848e9c", font: { size: 11 } }
                        }
                    }
                }
            };

            const qcPayload = {
                backgroundColor: "#181a20", // Binance dark theme background
                width: 800,
                height: 440,
                format: "png",
                version: "3",
                chart: chartConfig
            };

            // 3. Request chart image URL from QuickChart
            const qcRes = await axios.post(this.QUICKCHART_URL, qcPayload, { timeout: 7000 });
            const imageUrl = qcRes.data?.url;

            if (!imageUrl) {
                console.error("[ChartService] QuickChart did not return an image URL");
                return { error: "Failed to generate chart image." };
            }

            const changeSymbol = isUp ? "🟢 +" : "🔴 ";

            const caption = [
                `📊 *${coin} (USDT) — ${tf.label} Candlestick Chart*`,
                `💰 *Price:* $${formattedPrice}`,
                `📈 *High:* $${formattedHigh}`,
                `📉 *Low:* $${formattedLow}`,
                `🔄 *Change:* ${changeSymbol}${priceChange.toFixed(2)}%`,
                `💡 _Timeframes: 15m, 1h, 4h, 1d, 1w (e.g. "@bot ${coin.toLowerCase()} 4h chart")_`
            ].join("\n");

            const result: ChartResult = {
                symbol: coin,
                pair,
                timeframe: tfKey,
                imageUrl,
                currentPrice,
                priceChange,
                high24h: periodHigh,
                low24h: periodLow,
                caption
            };

            chartCache.set(cacheKey, { result, timestamp: now });
            return { result };
        } catch (err: any) {
            // Check for Binance invalid symbol error (code -1121)
            const binanceError = err.response?.data;
            if (binanceError && binanceError.code === -1121) {
                return { notFound: true, error: `Coin "${coin}" was not found on Binance.` };
            }

            console.error(`[ChartService] Error generating chart for ${coin} (${tfKey}):`, err?.message || err);

            // Stale cache fallback
            if (cached) {
                return { result: cached.result };
            }
            return { error: `Could not generate chart for ${coin} right now.` };
        }
    }

    /**
     * Backward-compatible alias for BTC.
     */
    public async getBtcCandlestickChart(forceFresh = false): Promise<ChartResult | null> {
        const res = await this.getCandlestickChart("BTC", "24h", forceFresh);
        return res.result || null;
    }
}

export const chartService = new ChartService();
