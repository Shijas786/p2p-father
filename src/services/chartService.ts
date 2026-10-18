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
    rndr: "RENDER",
    chz: "CHZ",
    chiliz: "CHZ",
    uni: "UNI",
    uniswap: "UNI",
    aave: "AAVE",
    ftm: "FTM",
    fantom: "FTM",
    xmr: "XMR",
    monero: "XMR"
};

// Patterns ordered from most specific to least specific
const TIMEFRAME_PATTERNS: { regex: RegExp; tf: string }[] = [
    { regex: /\b15\s*(?:m|min|mins|minutes?)\b/i, tf: "15m" },
    { regex: /\b4\s*(?:h|hr|hrs|hours?)\b/i, tf: "4h" },
    { regex: /\b24\s*(?:h|hr|hrs|hours?)\b/i, tf: "24h" },
    { regex: /\b(?:1\s*(?:h|hr|hrs|hours?)|60\s*(?:m|min|mins|minutes?))\b/i, tf: "1h" },
    { regex: /\b7\s*(?:d|day|days?)\b/i, tf: "7d" },
    { regex: /\b(?:30\s*(?:d|day|days?)|1\s*(?:mo|month)|monthly)\b/i, tf: "30d" },
    { regex: /\b(?:1\s*(?:w|wk|wks|weeks?)|weekly)\b/i, tf: "1w" },
    { regex: /\b(?:1\s*(?:d|day|days?)|daily)\b/i, tf: "1d" },
];

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
     * Extracts both timeframe and coin ticker from raw user text reliably.
     */
    public extractTimeframeAndCoin(rawText: string): { coin: string; timeframe: string } {
        // 1. Identify timeframe
        let timeframe = "24h";
        let matchedTfPattern: RegExp | null = null;

        for (const { regex, tf } of TIMEFRAME_PATTERNS) {
            const m = rawText.match(regex);
            if (m) {
                timeframe = tf;
                matchedTfPattern = regex;
                break;
            }
        }

        // 2. Clean message
        let clean = rawText
            .replace(/@\S+/g, " ") // Remove @mentions
            .replace(/^\/[a-zA-Z0-9_]+/g, " "); // Remove /command

        // Strip the matched timeframe if any
        if (matchedTfPattern) {
            clean = clean.replace(matchedTfPattern, " ");
        }
        // Remove generic timeframe units so words like "hr" or "hour" are not mistaken for coin tickers
        clean = clean.replace(/\b(?:hours?|hrs?|minutes?|mins?|days?|weeks?|daily|weekly|monthly)\b/gi, " ");

        // Remove keywords like "chart", "charts", "price", "prices", "rate", "rates", "candlestick", "candles"
        clean = clean.replace(/\b(?:chart|charts|price|prices|rate|rates|candlestick|candles?|candle|show|get|view|check|of|for|in|to)\b/gi, " ");

        // Clean punctuation
        clean = clean.replace(/[^a-zA-Z0-9\s]/g, " ").trim();

        // Words remaining
        const words = clean.split(/\s+/).filter(w => w.length > 0);

        // Look for a word that is a known coin alias or looks like a valid ticker
        let coin = "BTC";
        for (const w of words) {
            const lower = w.toLowerCase();
            if (COIN_ALIASES[lower]) {
                coin = COIN_ALIASES[lower];
                break;
            }
            if (/^[a-zA-Z][a-zA-Z0-9]{1,9}$/.test(w)) {
                coin = w.toUpperCase();
                break;
            }
        }

        return { coin, timeframe };
    }

    /**
     * Extracts timeframe from message text (e.g. "15m", "1h", "4h", "1d", "1w", "24h").
     * Defaults to "24h" if not found.
     */
    public extractTimeframeFromText(text: string): string {
        return this.extractTimeframeAndCoin(text).timeframe;
    }

    /**
     * Extracts coin ticker from message text (e.g. "@bot eth 4h chart", "sol price chart", "/chart doge 1d").
     */
    public extractCoinFromText(text: string): string {
        return this.extractTimeframeAndCoin(text).coin;
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

            // 2. Configure TradingView-styled candlestick chart (1200x675 HD)
            const chartConfig = {
                type: "candlestick",
                data: {
                    datasets: [{
                        label: `${coin}/USDT`,
                        data: candlestickData,
                        color: {
                            up: "#26a69a",       // TradingView Teal
                            down: "#ef5350",     // TradingView Red
                            unchanged: "#787b86"
                        }
                    }]
                },
                options: {
                    plugins: {
                        legend: { display: false },
                        title: {
                            display: true,
                            text: `${coin}/USDT • ${tf.label} • $${formattedPrice} (${isUp ? "+" : ""}${priceChange.toFixed(2)}%)`,
                            font: { size: 24, weight: "bold", family: "Trebuchet MS" },
                            color: isUp ? "#26a69a" : "#ef5350",
                            padding: { top: 14, bottom: 6 }
                        },
                        subtitle: {
                            display: true,
                            text: `O: $${formatPrice(firstCandle.o)}   H: $${formattedHigh}   L: $${formattedLow}   C: $${formattedPrice}  •  ⚡ P2PFather`,
                            font: { size: 14, family: "Trebuchet MS" },
                            color: "#787b86",
                            padding: { bottom: 16 }
                        }
                    },
                    scales: {
                        x: {
                            type: "time",
                            time: { unit: tf.unit },
                            grid: { color: "rgba(42, 46, 57, 0.6)" },
                            ticks: { color: "#787b86", font: { size: 12, family: "Trebuchet MS" } }
                        },
                        y: {
                            position: "right",
                            grid: { color: "rgba(42, 46, 57, 0.6)" },
                            ticks: { color: "#787b86", font: { size: 12, family: "Trebuchet MS" } }
                        }
                    }
                }
            };

            const qcPayload = {
                backgroundColor: "#131722", // TradingView dark theme
                width: 1200,
                height: 675,
                devicePixelRatio: 2,
                format: "png",
                version: "3",
                chart: chartConfig
            };

            // 3. Request chart image URL from QuickChart
            const qcRes = await axios.post(this.QUICKCHART_URL, qcPayload, { timeout: 9000 });
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
