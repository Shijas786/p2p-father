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
    market?: "Spot" | "Futures";
}

export interface TimeframeConfig {
    interval: string;
    limit: number;
    label: string;
    unit: "hour" | "day" | "month";
}

export const TIMEFRAMES: Record<string, TimeframeConfig> = {
    "15m": { interval: "15m", limit: 40, label: "10H (15M)", unit: "hour" },
    "1h":  { interval: "1h",  limit: 48, label: "48H (1H)", unit: "hour" },
    "24h": { interval: "1h",  limit: 48, label: "48H (1H)", unit: "hour" },
    "4h":  { interval: "4h",  limit: 42, label: "7D (4H)", unit: "day" },
    "1d":  { interval: "1d",  limit: 45, label: "45D (Daily)", unit: "day" },
    "30d": { interval: "1d",  limit: 45, label: "45D (Daily)", unit: "day" },
    "7d":  { interval: "4h",  limit: 42, label: "7D (4H)", unit: "day" },
    "1w":  { interval: "1w",  limit: 35, label: "8M (Weekly)", unit: "month" },
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
    monero: "XMR",
    "1000pepe": "1000PEPE",
    "1000bonk": "1000BONK",
    "1000sats": "1000SATS",
    sats: "1000SATS",
    "1000floki": "1000FLOKI",
    "1000shib": "1000SHIB",
    "1000cat": "1000CAT",
    "1000rats": "1000RATS",
    "1000cheems": "1000CHEEMS",
    neiro: "NEIRO",
    neiroeth: "NEIROETH",
    turbo: "TURBO",
    blur: "BLUR",
    tia: "TIA",
    celestia: "TIA",
    sei: "SEI",
    ondo: "ONDO",
    wif: "WIF",
    dogwifhat: "WIF",
    bome: "BOME",
    popcat: "POPCAT",
    mew: "MEW",
    not: "NOT",
    notcoin: "NOT",
    dogs: "DOGS",
    cats: "CATS",
    hmstr: "HMSTR",
    hamster: "HMSTR",
    q: "Q"
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

function calculateEMA(data: number[], timestamps: number[], period: number): { x: number; y: number }[] {
    const k = 2 / (period + 1);
    const result: { x: number; y: number }[] = [];
    if (data.length < period) return result;

    let prevEMA = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = 0; i < data.length; i++) {
        if (i === period - 1) {
            result.push({ x: timestamps[i], y: parseFloat(prevEMA.toFixed(4)) });
        } else if (i >= period) {
            prevEMA = data[i] * k + prevEMA * (1 - k);
            result.push({ x: timestamps[i], y: parseFloat(prevEMA.toFixed(4)) });
        }
    }
    return result;
}

function calculateMACD(
    closes: number[],
    timestamps: number[]
): {
    macdLine: { x: number; y: number }[];
    signalLine: { x: number; y: number }[];
    histogram: { x: number; y: number; backgroundColor: string }[];
} {
    const k12 = 2 / (12 + 1);
    const k26 = 2 / (26 + 1);
    const k9 = 2 / (9 + 1);

    const ema12: (number | null)[] = [];
    const ema26: (number | null)[] = [];

    let prev12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
    for (let i = 0; i < closes.length; i++) {
        if (i < 11) ema12.push(null);
        else if (i === 11) ema12.push(prev12);
        else {
            prev12 = closes[i] * k12 + prev12 * (1 - k12);
            ema12.push(prev12);
        }
    }

    let prev26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
    for (let i = 0; i < closes.length; i++) {
        if (i < 25) ema26.push(null);
        else if (i === 25) ema26.push(prev26);
        else {
            prev26 = closes[i] * k26 + prev26 * (1 - k26);
            ema26.push(prev26);
        }
    }

    const rawMacd: (number | null)[] = [];
    const validMacd: number[] = [];
    for (let i = 0; i < closes.length; i++) {
        if (ema12[i] !== null && ema26[i] !== null) {
            const val = (ema12[i] as number) - (ema26[i] as number);
            rawMacd.push(val);
            validMacd.push(val);
        } else {
            rawMacd.push(null);
        }
    }

    const rawSignal: (number | null)[] = [];
    let prevSig = validMacd.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
    let validCount = 0;
    for (let i = 0; i < rawMacd.length; i++) {
        if (rawMacd[i] === null) {
            rawSignal.push(null);
        } else {
            if (validCount < 8) {
                rawSignal.push(null);
            } else if (validCount === 8) {
                rawSignal.push(prevSig);
            } else {
                prevSig = (rawMacd[i] as number) * k9 + prevSig * (1 - k9);
                rawSignal.push(prevSig);
            }
            validCount++;
        }
    }

    const macdLine: { x: number; y: number }[] = [];
    const signalLine: { x: number; y: number }[] = [];
    const histogram: { x: number; y: number; backgroundColor: string }[] = [];

    for (let i = 0; i < timestamps.length; i++) {
        const time = timestamps[i];
        if (rawMacd[i] !== null) {
            macdLine.push({ x: time, y: parseFloat((rawMacd[i] as number).toFixed(4)) });
        }
        if (rawSignal[i] !== null) {
            const sig = rawSignal[i] as number;
            signalLine.push({ x: time, y: parseFloat(sig.toFixed(4)) });
            const hist = (rawMacd[i] as number) - sig;
            histogram.push({
                x: time,
                y: parseFloat(hist.toFixed(4)),
                backgroundColor: hist >= 0 ? "rgba(38, 166, 154, 0.85)" : "rgba(239, 83, 80, 0.85)"
            });
        }
    }

    return { macdLine, signalLine, histogram };
}

export class ChartService {
    private readonly BINANCE_SPOT_URL = "https://api.binance.com/api/v3/klines";
    private readonly BINANCE_FUTURES_URL = "https://fapi.binance.com/fapi/v1/klines";
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
     * Extracts timeframe, coin ticker, futures preference, and MACD indicator preference from raw user text.
     */
    public extractTimeframeAndCoin(rawText: string): { coin: string; timeframe: string; isFutures: boolean; isMacd: boolean } {
        const isFutures = /\b(?:perp|perpetual|perps|futures?|fut)\b/i.test(rawText);
        const isMacd = /\b(?:macd|mca)\b/i.test(rawText);

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
        // Remove bot display name tokens if mentioned as plain text (e.g. "@P2p Father")
        clean = clean.replace(/\b(?:p2p\s*father|p2pfather|p2p|father|bot)\b/gi, " ");

        // Remove generic timeframe units so words like "hr" or "hour" are not mistaken for coin tickers
        clean = clean.replace(/\b(?:hours?|hrs?|minutes?|mins?|days?|weeks?|daily|weekly|monthly)\b/gi, " ");

        // Remove futures/perp/indicator keywords
        clean = clean.replace(/\b(?:perp|perpetual|perps|futures?|fut|macd|mca|ema|sma|ma|indicator|indicators|shwig)\b/gi, " ");

        // Remove keywords and common noise words
        clean = clean.replace(/\b(?:chart|charts|price|prices|rate|rates|candlestick|candles?|candle|show|get|view|check|of|for|in|to|the|a|an|i|me|my|with)\b/gi, " ");

        // Clean punctuation
        clean = clean.replace(/[^a-zA-Z0-9\s]/g, " ").trim();

        // Words remaining
        const words = clean.split(/\s+/).filter(w => w.length > 0);

        // Look for a word that is a known coin alias or looks like a valid ticker (including single letters like Q, or 1000pepe)
        let coin = "BTC";
        for (const w of words) {
            const lower = w.toLowerCase();
            if (COIN_ALIASES[lower]) {
                coin = COIN_ALIASES[lower];
                break;
            }
            if (/^(?!\d+$)[a-zA-Z0-9]{1,12}$/.test(w)) {
                coin = w.toUpperCase();
                break;
            }
        }

        return { coin, timeframe, isFutures, isMacd };
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
     * Supports both Binance Spot and Binance USD-M Futures with automatic fallback.
     */
    public async getCandlestickChart(
        coinInput = "BTC",
        timeframeInput = "24h",
        forceFresh = false,
        preferFutures = false,
        preferMacd = false
    ): Promise<{ result?: ChartResult; notFound?: boolean; error?: string }> {
        let { coin, pair } = this.resolveCoin(coinInput);
        const tfKey = timeframeInput.toLowerCase();
        const tf = TIMEFRAMES[tfKey] || TIMEFRAMES["24h"];
        const now = Date.now();

        // Cache key per pair + timeframe + market + indicator preference
        const cacheKey = `${pair}_${tfKey}_${preferFutures ? "futures" : "any"}_${preferMacd ? "macd" : "std"}`;
        const cached = chartCache.get(cacheKey);
        if (!forceFresh && cached && (now - cached.timestamp) < CACHE_TTL_MS) {
            return { result: cached.result };
        }

        try {
            let rawData: any[] | null = null;
            let market: "Spot" | "Futures" = "Spot";

            const fetchKlines = async (url: string, symbol: string): Promise<any[] | null> => {
                try {
                    const res = await axios.get(url, {
                        params: {
                            symbol,
                            interval: tf.interval,
                            limit: tf.limit
                        },
                        timeout: 5000
                    });
                    return Array.isArray(res.data) && res.data.length > 0 ? res.data : null;
                } catch {
                    return null;
                }
            };

            // 1. If user explicitly requested futures OR coin starts with 1000 (e.g. 1000PEPE)
            if (preferFutures || pair.startsWith("1000")) {
                rawData = await fetchKlines(this.BINANCE_FUTURES_URL, pair);
                if (rawData) {
                    market = "Futures";
                }
            }

            // 2. Try Spot if not already loaded from Futures
            if (!rawData && !preferFutures) {
                rawData = await fetchKlines(this.BINANCE_SPOT_URL, pair);
                if (rawData) {
                    market = "Spot";
                }
            }

            // 3. Fallback to Futures if Spot failed (for Futures-only coins like NEIROETH, or if Spot returned 400)
            if (!rawData) {
                rawData = await fetchKlines(this.BINANCE_FUTURES_URL, pair);
                if (rawData) {
                    market = "Futures";
                }
            }

            // 4. Fallback to 1000x multiplier on Futures (e.g. PEPE -> 1000PEPE, BONK -> 1000BONK, SATS -> 1000SATS)
            if (!rawData && !pair.startsWith("1000")) {
                const thousandPair = `1000${pair}`;
                rawData = await fetchKlines(this.BINANCE_FUTURES_URL, thousandPair);
                if (rawData) {
                    market = "Futures";
                    pair = thousandPair;
                    coin = `1000${coin}`;
                }
            }

            if (!rawData || rawData.length === 0) {
                return { notFound: true, error: `Coin "${coin}" was not found on Binance Spot or Futures.` };
            }

            let periodHigh = -Infinity;
            let periodLow = Infinity;

            const candlestickData: CandlestickData[] = [];
            const volumeData: { x: number; y: number; backgroundColor: string }[] = [];
            const closes: number[] = [];
            const timestamps: number[] = [];

            for (const c of rawData) {
                const time = c[0];
                const o = parseFloat(c[1]);
                const h = parseFloat(c[2]);
                const l = parseFloat(c[3]);
                const cl = parseFloat(c[4]);
                const vol = parseFloat(c[5]) || 0;

                if (h > periodHigh) periodHigh = h;
                if (l < periodLow) periodLow = l;

                candlestickData.push({ x: time, o, h, l, c: cl });
                closes.push(cl);
                timestamps.push(time);
                volumeData.push({
                    x: time,
                    y: vol,
                    backgroundColor: cl >= o ? "rgba(38, 166, 154, 0.45)" : "rgba(239, 83, 80, 0.45)"
                });
            }

            const lastCandle = candlestickData[candlestickData.length - 1];
            const firstCandle = candlestickData[0];
            const currentPrice = lastCandle.c;
            const priceChange = ((currentPrice - firstCandle.o) / firstCandle.o) * 100;
            const isUp = priceChange >= 0;

            const formattedPrice = formatPrice(currentPrice);
            const formattedHigh = formatPrice(periodHigh);
            const formattedLow = formatPrice(periodLow);

            const isFutures = market === "Futures";
            const marketBadge = isFutures ? " (Perp)" : "";
            const marketSubtitle = isFutures ? "⚡ P2PFather Futures" : "⚡ P2PFather";

            // Calculate EMA(7) and EMA(25)
            const ema7 = calculateEMA(closes, timestamps, 7);
            const ema25 = calculateEMA(closes, timestamps, 25);
            const maxVol = Math.max(...volumeData.map(v => v.y), 1);

            let chartConfig: any;
            let chartHeight = 675;

            if (preferMacd) {
                // Stacked Candlestick + EMA + MACD Panel
                chartHeight = 750;
                const macd = calculateMACD(closes, timestamps);

                chartConfig = {
                    type: "candlestick",
                    data: {
                        datasets: [
                            {
                                type: "candlestick",
                                label: `${coin}/USDT${marketBadge}`,
                                data: candlestickData,
                                color: {
                                    up: "#26a69a",
                                    down: "#ef5350",
                                    unchanged: "#787b86"
                                },
                                yAxisID: "yPrice"
                            },
                            {
                                type: "line",
                                label: "EMA(7)",
                                data: ema7,
                                borderColor: "#f5ac37",
                                borderWidth: 2,
                                pointRadius: 0,
                                yAxisID: "yPrice"
                            },
                            {
                                type: "line",
                                label: "EMA(25)",
                                data: ema25,
                                borderColor: "#b388ff",
                                borderWidth: 2,
                                pointRadius: 0,
                                yAxisID: "yPrice"
                            },
                            {
                                type: "bar",
                                label: "MACD Hist",
                                data: macd.histogram.map(h => ({ x: h.x, y: h.y })),
                                backgroundColor: macd.histogram.map(h => h.backgroundColor),
                                yAxisID: "yMACD",
                                barPercentage: 0.6
                            },
                            {
                                type: "line",
                                label: "MACD(12,26)",
                                data: macd.macdLine,
                                borderColor: "#2962ff",
                                borderWidth: 1.5,
                                pointRadius: 0,
                                yAxisID: "yMACD"
                            },
                            {
                                type: "line",
                                label: "Signal(9)",
                                data: macd.signalLine,
                                borderColor: "#ff6d00",
                                borderWidth: 1.5,
                                pointRadius: 0,
                                yAxisID: "yMACD"
                            }
                        ]
                    },
                    options: {
                        plugins: {
                            legend: {
                                display: true,
                                position: "top",
                                align: "start",
                                labels: {
                                    color: "#d1d4dc",
                                    font: { family: "Trebuchet MS", size: 11 },
                                    boxWidth: 12
                                }
                            },
                            title: {
                                display: true,
                                text: `${coin}/USDT${marketBadge} • ${tf.label} • $${formattedPrice} (${isUp ? "+" : ""}${priceChange.toFixed(2)}%)`,
                                font: { size: 24, weight: "bold", family: "Trebuchet MS" },
                                color: isUp ? "#26a69a" : "#ef5350",
                                padding: { top: 12, bottom: 4 }
                            },
                            subtitle: {
                                display: true,
                                text: `O: $${formatPrice(firstCandle.o)}   H: $${formattedHigh}   L: $${formattedLow}   C: $${formattedPrice}  •  ${marketSubtitle}`,
                                font: { size: 13, family: "Trebuchet MS" },
                                color: "#787b86",
                                padding: { bottom: 12 }
                            }
                        },
                        scales: {
                            x: {
                                type: "time",
                                time: { unit: tf.unit },
                                grid: { color: "rgba(42, 46, 57, 0.6)" },
                                ticks: { color: "#787b86", font: { size: 11, family: "Trebuchet MS" } }
                            },
                            yPrice: {
                                position: "right",
                                stack: "main",
                                stackWeight: 3.2,
                                grid: { color: "rgba(42, 46, 57, 0.6)" },
                                ticks: { color: "#d1d4dc", font: { size: 12, family: "Trebuchet MS" } }
                            },
                            yMACD: {
                                position: "right",
                                stack: "main",
                                stackWeight: 1.2,
                                offset: true,
                                grid: { color: "rgba(42, 46, 57, 0.4)" },
                                ticks: { color: "#787b86", font: { size: 10, family: "Trebuchet MS" } }
                            }
                        }
                    }
                };
            } else {
                // Classic TradingView View: Candlestick + EMA(7) + EMA(25) + Volume Bars
                chartConfig = {
                    type: "candlestick",
                    data: {
                        datasets: [
                            {
                                type: "candlestick",
                                label: `${coin}/USDT${marketBadge}`,
                                data: candlestickData,
                                color: {
                                    up: "#26a69a",
                                    down: "#ef5350",
                                    unchanged: "#787b86"
                                },
                                yAxisID: "y"
                            },
                            {
                                type: "line",
                                label: "EMA(7)",
                                data: ema7,
                                borderColor: "#f5ac37", // Amber
                                borderWidth: 2,
                                pointRadius: 0,
                                yAxisID: "y"
                            },
                            {
                                type: "line",
                                label: "EMA(25)",
                                data: ema25,
                                borderColor: "#b388ff", // Purple
                                borderWidth: 2,
                                pointRadius: 0,
                                yAxisID: "y"
                            },
                            {
                                type: "bar",
                                label: "Volume",
                                data: volumeData.map(v => ({ x: v.x, y: v.y })),
                                backgroundColor: volumeData.map(v => v.backgroundColor),
                                yAxisID: "yVol",
                                barPercentage: 0.8
                            }
                        ]
                    },
                    options: {
                        plugins: {
                            legend: {
                                display: true,
                                position: "top",
                                align: "start",
                                labels: {
                                    color: "#d1d4dc",
                                    font: { family: "Trebuchet MS", size: 12 },
                                    boxWidth: 14
                                }
                            },
                            title: {
                                display: true,
                                text: `${coin}/USDT${marketBadge} • ${tf.label} • $${formattedPrice} (${isUp ? "+" : ""}${priceChange.toFixed(2)}%)`,
                                font: { size: 24, weight: "bold", family: "Trebuchet MS" },
                                color: isUp ? "#26a69a" : "#ef5350",
                                padding: { top: 12, bottom: 4 }
                            },
                            subtitle: {
                                display: true,
                                text: `O: $${formatPrice(firstCandle.o)}   H: $${formattedHigh}   L: $${formattedLow}   C: $${formattedPrice}  •  ${marketSubtitle}`,
                                font: { size: 13, family: "Trebuchet MS" },
                                color: "#787b86",
                                padding: { bottom: 12 }
                            }
                        },
                        scales: {
                            x: {
                                type: "time",
                                time: { unit: tf.unit },
                                grid: { color: "rgba(42, 46, 57, 0.6)" },
                                ticks: { color: "#787b86", font: { size: 11, family: "Trebuchet MS" } }
                            },
                            y: {
                                position: "right",
                                grid: { color: "rgba(42, 46, 57, 0.6)" },
                                ticks: { color: "#d1d4dc", font: { size: 12, family: "Trebuchet MS" } }
                            },
                            yVol: {
                                position: "left",
                                display: false,
                                max: maxVol * 4.5,
                                grid: { display: false }
                            }
                        }
                    }
                };
            }

            const qcPayload = {
                backgroundColor: "#131722", // TradingView dark theme
                width: 1200,
                height: chartHeight,
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
            const indicatorsList = preferMacd ? "EMA(7), EMA(25), MACD(12,26,9)" : "EMA(7), EMA(25), Volume";

            const caption = [
                `📊 *${coin} (USDT${isFutures ? " Perp" : ""}) — ${tf.label} Candlestick Chart*`,
                `💰 *Price:* $${formattedPrice}`,
                `📈 *High:* $${formattedHigh}`,
                `📉 *Low:* $${formattedLow}`,
                `🔄 *Change:* ${changeSymbol}${priceChange.toFixed(2)}%`,
                `📈 *Indicators:* ${indicatorsList}`,
                `💡 _Tip: Type "macd" for MACD indicator, or "4h" / "1d" for timeframes._`
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
                caption,
                market
            };

            chartCache.set(cacheKey, { result, timestamp: now });
            return { result };
        } catch (err: any) {
            // Check for Binance invalid symbol error (code -1121)
            const binanceError = err.response?.data;
            if (binanceError && binanceError.code === -1121) {
                return { notFound: true, error: `Coin "${coin}" was not found on Binance Spot or Futures.` };
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
