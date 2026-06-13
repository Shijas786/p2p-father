import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPublicClient, http } from 'viem';
import { polygon } from 'viem/chains';
import { api } from '../lib/api';
import { polymarketWs } from '../lib/polymarketWs';
import { haptic } from '../lib/telegram';
import { useToast } from '../components/Toast';
import { TradingViewChart } from '../components/TradingViewChart';
import { TradePanel } from '../components/TradePanel';
import { DepositModal } from '../components/DepositModal';
import './Predict.css';

interface Props { user: any; }

interface Round {
    time: string; open: number;
    close: number | null; outcome: 'UP' | 'DOWN' | null; timestamp: number;
}

const chainlinkClient = createPublicClient({
    chain: polygon,
    transport: http('https://polygon.llamarpc.com')
});
const CHAINLINK_BTC_USD = '0xc907E116054Ad103354f2D350FD2514433D57F6f';
const chainlinkAbi = [{"inputs":[],"name":"latestRoundData","outputs":[{"internalType":"uint80","name":"roundId","type":"uint80"},{"internalType":"int256","name":"answer","type":"int256"},{"internalType":"uint256","name":"startedAt","type":"uint256"},{"internalType":"uint256","name":"updatedAt","type":"uint256"},{"internalType":"uint80","name":"answeredInRound","type":"uint80"}],"stateMutability":"view","type":"function"}];

interface Trade {
    id: string; side: string;
    outcome: string; qty: number; price: number; cost: number; timestamp: number;
}
interface Position {
    outcome: 'UP' | 'DOWN'; qty: number; avg: number;
    currentPrice: number; value: number; cost: number;
    returnAmt: number; returnPct: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function timeAgo(ts: number): string {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60)  return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
}

export function Predict({ user }: Props) {
    const { showToast } = useToast();
    const navigate = useNavigate();
    const { slug: routeSlug } = useParams<{slug?: string}>();
    const isHistorical = !!routeSlug;

    // Price & timer
    const [livePrice, setLivePrice]   = useState(0);
    const [priceToBeat, setPriceToBeat] = useState(0);
    const [timeLeft, setTimeLeft]     = useState({ mins: '04', secs: '59' });
    const [roundLabel, setRoundLabel] = useState('');
    const [liveEndMs, setLiveEndMs] = useState(0);
    const [priceFlash, setPriceFlash] = useState<'up'|'down'|null>(null);

    // Market data
    const [history, setHistory]       = useState<Round[]>([]);
    const [selectedRound, setSelectedRound] = useState(-1);
    const [cashBalance, setCashBalance] = useState('0.00');
    const [yesPrice, setYesPrice]     = useState({ buyPrice: 0.00, sellPrice: 0.00 });
    const [noPrice, setNoPrice]       = useState({ buyPrice: 0.00, sellPrice: 0.00 });
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [unclaimedWinnings, setUnclaimedWinnings] = useState<number>(0);
    
    // State: Open Orders
    const [openOrders, setOpenOrders] = useState<any[]>([]);
    const [cancelingOrder, setCancelingOrder] = useState<string | null>(null);

    // State: Prediction Market
    const [activeMarket, setActiveMarket] = useState<any>(null);
    const [nextMarket, setNextMarket] = useState<any>(null);

    // Positions & trades
    const [positions, setPositions]   = useState<Position[]>([]);
    const [trades, setTrades]         = useState<Trade[]>([]);
    const [recentTrades, setRecentTrades] = useState<Trade[]>([]);

    // User Trade Actions
    const [tradeType, setTradeType]   = useState<'buy'|'sell'>('buy');
    const [betType, setBetType]       = useState<'UP'|'DOWN'>('UP');
    const [betAmount, setBetAmount]   = useState('');
    const [orderType, setOrderType]   = useState<'MARKET'|'LIMIT'>('MARKET');
    const [limitPrice, setLimitPrice] = useState<string>('');
    const [sellPercentage, setSellPercentage] = useState<number>(0);
    const [placingBet, setPlacingBet] = useState(false);
    const [betSlowMsg, setBetSlowMsg] = useState('');
    const [isClaiming, setIsClaiming] = useState(false);
    
    // Notifications
    const [showNotifications, setShowNotifications] = useState(false);
    const [showProfileMenu, setShowProfileMenu] = useState(false);

    // Modals
    const [showDepositModal, setShowDepositModal]     = useState(false);
    const [depositModalMode, setDepositModalMode]     = useState<'deposit'|'withdraw'>('deposit');
    const [showWithdrawModal, setShowWithdrawModal]   = useState(false);
    const [depositAddress, setDepositAddress]         = useState('');
    const [evmBridgeAddress, setEvmBridgeAddress]     = useState('');
    const [depositWalletLoading, setDepositWalletLoading] = useState(false);
    const [withdrawAmount, setWithdrawAmount]         = useState('');
    const [withdrawRecipient, setWithdrawRecipient]   = useState('');
    const [withdrawLoading, setWithdrawLoading]       = useState(false);
    const [showNetPositions, setShowNetPositions]     = useState(false);
    const [historyPage, setHistoryPage]               = useState(0);

    const chartRef = useRef<HTMLDivElement>(null);
    const activeMarketRef = useRef<any>(null);
    const nextMarketRef = useRef<any>(null);
    const yesPriceRef = useRef(yesPrice);
    const noPriceRef = useRef(noPrice);

    useEffect(() => {
        activeMarketRef.current = activeMarket;
    }, [activeMarket]);

    useEffect(() => {
        nextMarketRef.current = nextMarket;
    }, [nextMarket]);

    useEffect(() => {
        yesPriceRef.current = yesPrice;
    }, [yesPrice]);

    useEffect(() => {
        noPriceRef.current = noPrice;
    }, [noPrice]);

    // ── Load all data ───────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const snap = await api.predictions.getSnapshot();
            
            // Set balance
            if (snap.balance !== undefined) {
                setCashBalance(snap.balance);
            }
            if ((snap as any).unclaimedWinnings !== undefined) {
                setUnclaimedWinnings((snap as any).unclaimedWinnings);
            }
            // Set deposit address
            if (snap.depositAddress !== undefined) {
                setDepositAddress(snap.depositAddress);
            }
            // Set trades
            if (snap.trades !== undefined) {
                setTrades(snap.trades);
            }
            // Set recent trades
            if (snap.recentTrades !== undefined) {
                setRecentTrades(snap.recentTrades);
            }
            // Set history
            if (snap.history !== undefined) {
                const parsed: Round[] = snap.history.map((h: any) => ({
                    time: h.time, open: h.open, close: h.close,
                    outcome: h.outcome, timestamp: h.timestamp,
                }));
                setHistory(parsed);
                // Only use history as fallback — prefer openPrice from the market object
                if (parsed.length > 0 && !snap.market?.openPrice) {
                    // history[0] is newest (backend reverses it), that's the current round's open
                    setPriceToBeat(parsed[0].open || 0);
                }
            }

            if (snap.market) {
                // Use the exact Binance open price for this round if available
                if (snap.market.openPrice) {
                    setPriceToBeat(snap.market.openPrice);
                }
                const currentMarket = activeMarketRef.current;
                if (currentMarket && snap.market.slug !== currentMarket.slug) {
                    // Backend rolled over to a new market! Keep showing current (ended) market
                    nextMarketRef.current = snap.market;
                    setNextMarket(snap.market);
                } else {
                    // First load or same market
                    activeMarketRef.current = snap.market;
                    setActiveMarket(snap.market);
                    if (snap.market.yesPrice && snap.market.noPrice) {
                        setYesPrice(snap.market.yesPrice);
                        setNoPrice(snap.market.noPrice);
                    }
                    
                    // Sync WebSocket with backend positions to remove duplicates
                    if (snap.positions) {
                        const activeBtcMarket = snap.market;
                        if (activeBtcMarket) {
                            const syncedAssets: string[] = [];
                            for (const p of snap.positions) {
                                if (p.outcome === 'UP') syncedAssets.push(activeBtcMarket.yesTokenId);
                                if (p.outcome === 'DOWN') syncedAssets.push(activeBtcMarket.noTokenId);
                            }
                            polymarketWs.syncWithBackend(syncedAssets);
                        }
                        
                        // Merge WS positions into data API positions
                        const basePositions = [...snap.positions];
                        const wsPositions = polymarketWs.getPositions();
                        
                        const yesPriceObj = activeBtcMarket?.yesPrice || { buyPrice: 0.5 };
                        const noPriceObj = activeBtcMarket?.noPrice || { buyPrice: 0.5 };

                        for (const wsPos of wsPositions) {
                            if (!activeBtcMarket) continue;
                            
                            const assetLc = wsPos.asset.toLowerCase();
                            const isYes = assetLc === activeBtcMarket.yesTokenId.toLowerCase();
                            const isNo = assetLc === activeBtcMarket.noTokenId.toLowerCase();
                            
                            if (!isYes && !isNo) continue;

                            const mappedOutcome = isYes ? 'UP' : 'DOWN';

                            const idx = basePositions.findIndex(p => p.outcome === mappedOutcome);
                            if (idx >= 0) {
                                const oldQty = basePositions[idx].qty;
                                basePositions[idx].qty += wsPos.size;
                                
                                if (wsPos.size < 0 && oldQty > 0) {
                                    const avgCost = basePositions[idx].cost / oldQty;
                                    basePositions[idx].cost -= Math.abs(wsPos.size) * avgCost;
                                } else {
                                    basePositions[idx].cost += wsPos.size * wsPos.price;
                                }

                                basePositions[idx].value += wsPos.size * basePositions[idx].currentPrice;
                                basePositions[idx].avg = basePositions[idx].qty > 0 ? basePositions[idx].cost / basePositions[idx].qty : 0;
                            } else {
                                const execPrice = wsPos.price;
                                const outcomePrice = mappedOutcome === 'UP' ? yesPriceObj.buyPrice : noPriceObj.buyPrice;
                                const initialCost = wsPos.size * execPrice;
                                const currentValue = wsPos.size * outcomePrice;
                                basePositions.push({
                                    outcome: mappedOutcome,
                                    qty: wsPos.size,
                                    avg: execPrice,
                                    currentPrice: outcomePrice,
                                    cost: initialCost,
                                    value: currentValue,
                                    returnAmt: currentValue - initialCost,
                                    returnPct: initialCost > 0 ? ((currentValue - initialCost) / initialCost) * 100 : 0
                                });
                            }
                        }
                        
                        const finalPositions = basePositions.filter(p => p.qty > 0.001);
                        setPositions(finalPositions);
                    }
                }
            }
        } catch (err) {
            console.error("Failed to load initial data", err);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadOpenOrders = useCallback(async () => {
        try {
            const res = await api.predictions.getOpenOrders();
            if (res.success) {
                setOpenOrders(res.orders);
            }
        } catch (err) {
            console.error("Failed to load open orders", err);
        }
    }, []);

    const handleCancelOrder = async (orderId: string) => {
        try {
            setCancelingOrder(orderId);
            const res = await api.predictions.cancelOrder(orderId);
            if (res.success) {
                showToast("Order canceled", "success");
                loadOpenOrders();
            } else {
                showToast("Failed to cancel order", "error");
            }
        } catch (err: any) {
            showToast("Failed to cancel order", "error");
        } finally {
            setCancelingOrder(null);
        }
    };

    // Load initial data
    useEffect(() => {
        loadData();
        loadOpenOrders();
    }, [loadData, loadOpenOrders]);

    // ── WebSocket Initialization ─────────────────────────────────────────────
    useEffect(() => {
        let unsubscribe = () => {};
        const initWs = async () => {
            try {
                const keys = await api.predictions.getClobKeys();
                if (keys.apiKey && keys.secret && keys.passphrase) {
                    polymarketWs.connect(keys.apiKey, keys.secret, keys.passphrase);
                    unsubscribe = polymarketWs.subscribe((wsPositions) => {
                        // Merge WS positions immediately into state
                        setPositions(prev => {
                            const newPos = [...prev];
                            const activeBtcMarket = activeMarketRef.current;
                            const yesPriceObj = yesPriceRef.current || { buyPrice: 0.5 };
                            const noPriceObj = noPriceRef.current || { buyPrice: 0.5 };

                            for (const wsPos of wsPositions) {
                                if (!activeBtcMarket) continue;
                                
                                const assetLc = wsPos.asset.toLowerCase();
                                const isYes = assetLc === activeBtcMarket.yesTokenId.toLowerCase();
                                const isNo = assetLc === activeBtcMarket.noTokenId.toLowerCase();
                                
                                if (!isYes && !isNo) continue;

                                const mappedOutcome = isYes ? 'UP' : 'DOWN';
                                const outcomePrice = mappedOutcome === 'UP' ? yesPriceObj.buyPrice : noPriceObj.buyPrice;

                                const idx = newPos.findIndex(p => p.outcome === mappedOutcome);
                                if (idx >= 0) {
                                    const oldQty = newPos[idx].qty;
                                    const newQty = wsPos.size;
                                    
                                    newPos[idx].qty = newQty;
                                    
                                    if (newQty !== oldQty) {
                                        if (newQty <= 0) {
                                            newPos[idx].cost = 0;
                                            newPos[idx].avg = 0;
                                        } else {
                                            const delta = newQty - oldQty;
                                            if (delta < 0 && oldQty > 0) {
                                                const avgCost = newPos[idx].cost / oldQty;
                                                newPos[idx].cost -= Math.abs(delta) * avgCost;
                                            } else {
                                                newPos[idx].cost += delta * wsPos.price;
                                            }
                                            newPos[idx].avg = newPos[idx].cost / newQty;
                                        }
                                    }
                                    newPos[idx].currentPrice = outcomePrice;
                                    newPos[idx].value = newQty * outcomePrice;
                                    newPos[idx].returnAmt = newPos[idx].value - newPos[idx].cost;
                                    newPos[idx].returnPct = newPos[idx].cost > 0 ? (newPos[idx].returnAmt / newPos[idx].cost) * 100 : 0;
                                } else {
                                    const execPrice = wsPos.price || outcomePrice || 0.5;
                                    const initialCost = wsPos.size * execPrice;
                                    const currentValue = wsPos.size * outcomePrice;
                                    newPos.push({
                                        outcome: mappedOutcome,
                                        qty: wsPos.size,
                                        avg: execPrice,
                                        currentPrice: outcomePrice,
                                        cost: initialCost,
                                        value: currentValue,
                                        returnAmt: currentValue - initialCost,
                                        returnPct: initialCost > 0 ? ((currentValue - initialCost) / initialCost) * 100 : 0
                                    });
                                }
                            }
                            return newPos.filter(p => p.qty > 0.001);
                        });
                    });
                }
            } catch (e) { console.warn("Failed to init CLOB keys", e); }
        };
        initWs();
        return () => {
            unsubscribe();
            polymarketWs.disconnect();
        };
    }, [loadData]);

    // ── Live price from our Railway WS proxy (works on mobile data) ──
    useEffect(() => {
        let prev = 0;
        let ws: WebSocket | null = null;
        let timeoutId: any;
        let fallbackWs: WebSocket | null = null;
        let usingFallback = false;

        // Build the proxy URL from the current page host
        const host = window.location.host;
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const proxyUrl = `${proto}//${host}/ws/btcprice`;

        const handleMsg = (priceStr: string) => {
            const p = parseFloat(priceStr);
            if (p > 0) {
                if (prev > 0 && p !== prev) {
                    setPriceFlash(p > prev ? 'up' : 'down');
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => setPriceFlash(null), 600);
                }
                prev = p;
                setLivePrice(p);
                setPriceToBeat(ptb => ptb === 0 ? p : ptb);
            }
        };

        const connectFallback = () => {
            if (usingFallback) return;
            usingFallback = true;
            console.warn('[Price WS] Proxy failed, falling back to Binance direct');
            fallbackWs = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');
            fallbackWs.onmessage = (e) => {
                try { handleMsg(JSON.parse(e.data).p); } catch {}
            };
            fallbackWs.onclose = () => setTimeout(connectFallback, 3000);
        };

        // Try proxy first (always works on mobile data via Railway)
        ws = new WebSocket(proxyUrl);
        const proxyTimeout = setTimeout(connectFallback, 5000); // if proxy doesn't connect in 5s, use fallback

        ws.onopen = () => clearTimeout(proxyTimeout);
        ws.onmessage = (e) => {
            try { handleMsg(JSON.parse(e.data).p); } catch {}
        };
        ws.onerror = () => connectFallback();
        ws.onclose = () => {
            if (!usingFallback) {
                console.warn('[Price WS] Proxy closed, reconnecting...');
                setTimeout(() => {
                    ws = new WebSocket(proxyUrl);
                }, 3000);
            }
        };

        return () => {
            if (ws) {
                ws.onclose = null; // prevent reconnect on unmount
                ws.close();
            }
            clearTimeout(timeoutId);
        };
    }, []);

    // ── Live odds via our Railway proxy (mobile-safe, cached 2.5s server-side) ──
    useEffect(() => {
        let activeBtcMarket: any = null;
        let intervalId: any;

        const fetchPoly = async () => {
            if (nextMarketRef.current || (activeMarketRef.current && new Date(activeMarketRef.current.endsAt).getTime() <= Date.now())) {
                return;
            }
            try {
                // Use our backend proxy — never hits clob.polymarket.com from the browser
                // This works on all mobile networks (Jio/Airtel/etc.)
                const res = await fetch('/api/miniapp/predictions/orderbook');
                if (!res.ok) return;
                const book = await res.json();

                if (book.yes && book.no) {
                    setYesPrice({ buyPrice: book.yes.buyPrice, sellPrice: book.yes.sellPrice });
                    setNoPrice({ buyPrice: book.no.buyPrice, sellPrice: book.no.sellPrice });
                }

                // Also keep activeBtcMarket in sync for other uses
                if (!activeBtcMarket) {
                    try {
                        const r = await api.predictions.getMarket();
                        if (r?.market) {
                            activeBtcMarket = r.market;
                            if (isHistorical) setLiveEndMs(new Date(r.market.endsAt).getTime());
                        }
                    } catch {}
                }
            } catch (e) {
                console.warn('[Orderbook] proxy fetch failed:', e);
            }
        };

        fetchPoly();
        intervalId = setInterval(fetchPoly, 3000); // 3s — server already caches at 2.5s

        return () => clearInterval(intervalId);
    }, []);

    // ── Static Strike Price (Price to Beat) ──────────────
    // Extracted strictly from Polymarket Gamma API above to ensure perfect parity.
    useEffect(() => {
        // Fallback only if Polymarket API hasn't loaded a valid strike
        if (priceToBeat === 0 && history && history.length > 0) {
            setPriceToBeat(history[0].open); // history[0] = current round (backend sends newest first)
        }

        // If historical slug, find and select that round
        if (isHistorical && routeSlug && history.length > 0) {
            const match = routeSlug.match(/-(\d+)$/);
            if (match) {
                const targetMs = parseInt(match[1]) * 1000;
                const idx = history.findIndex(r => r.timestamp === targetMs);
                if (idx >= 0) {
                    setSelectedRound(idx);
                } else if (targetMs > 0) {
                    // Fetch historical round from Binance
                    fetch(`/api/miniapp/predictions/klines?symbol=BTCUSDT&interval=5m&startTime=${targetMs}&limit=1`)
                        .then(res => res.json())
                        .then(data => {
                            if (data && data.length > 0) {
                                const k = data[0];
                                const open = parseFloat(k[1]);
                                const close = parseFloat(k[4]);
                                setHistory(prev => {
                                    if (prev.some(r => r.timestamp === targetMs)) return prev;
                                    return [...prev, {
                                        timestamp: targetMs,
                                        time: new Date(targetMs).toLocaleTimeString(),
                                        open, close, high: parseFloat(k[2]), low: parseFloat(k[3]),
                                        outcome: close >= open ? 'UP' : 'DOWN'
                                    } as Round].sort((a, b) => a.timestamp - b.timestamp);
                                });
                            }
                        })
                        .catch(console.error);
                }
            }
        } else if (!isHistorical) {
            setSelectedRound(-1);
        }
    }, [history, priceToBeat, isHistorical, routeSlug]);

    // ── Countdown ───────────────────────────────────────────────────────────
    useEffect(() => {
        if (isHistorical) return;
        let lastNextTime = 0;
        
        const tick = () => {
            if (isHistorical) return;
            const now = new Date();
            const next = new Date(Math.ceil(now.getTime() / 300000) * 300000);
            const nextTime = next.getTime();
            
            // If the 5-minute round has rolled over (clock-based for shifting historical lists)
            if (lastNextTime !== 0 && nextTime > lastNextTime) {
                setSelectedRound(prev => prev >= 1 ? prev + 1 : prev);
            }
            lastNextTime = nextTime;

            const market = activeMarketRef.current;
            if (!market || !market.endsAt) {
                const diff = nextTime - now.getTime();
                setTimeLeft({
                    mins: Math.max(0, Math.floor(diff / 60000)).toString().padStart(2, '0'),
                    secs: Math.max(0, Math.floor((diff % 60000) / 1000)).toString().padStart(2, '0'),
                });
                setLiveEndMs(nextTime);
                
                const start = new Date(nextTime - 300000);
                const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '');
                setRoundLabel(`${now.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${formatTime(start)}-${formatTime(next)}`);
                return;
            }

            const endsAtMs = new Date(market.endsAt).getTime();
            const diff = endsAtMs - now.getTime();
            setLiveEndMs(endsAtMs);

            if (diff <= 0) {
                setTimeLeft({ mins: '00', secs: '00' });
            } else {
                setTimeLeft({
                    mins: Math.floor(diff / 60000).toString().padStart(2, '0'),
                    secs: Math.floor((diff % 60000) / 1000).toString().padStart(2, '0'),
                });
            }
            
            const start = new Date(endsAtMs - 300000);
            const end = new Date(endsAtMs);
            const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '');
            setRoundLabel(`${start.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${formatTime(start)}-${formatTime(end)}`);
        };
        tick();
        const iv = setInterval(tick, 1000);
        return () => clearInterval(iv);
    }, [isHistorical]);

    // Poll for next market when countdown is 00:00 and nextMarket is not yet set
    // Auto-clear positions the moment the round ends so stale positions
    // don't show while waiting for the next market to be available
    const roundEndedRef = useRef(false);
    useEffect(() => {
        if (isHistorical || selectedRound !== -1) return;
        const isEnded = timeLeft.mins === '00' && timeLeft.secs === '00';
        if (!isEnded) {
            roundEndedRef.current = false;
            return;
        }

        // Clear stale positions immediately when round ends
        if (!roundEndedRef.current) {
            roundEndedRef.current = true;
            setPositions([]);
            polymarketWs.clearPositions();
        }

        // Poll for the next market — auto-transition when it arrives (no tap needed)
        if (nextMarket) return;
        const interval = setInterval(() => {
            loadData();
        }, 5000); // check every 5s instead of 10s for faster transition

        return () => clearInterval(interval);
    }, [timeLeft, nextMarket, isHistorical, selectedRound, loadData]);

    // Auto-transition to next market as soon as backend confirms it — no tap needed
    useEffect(() => {
        if (!nextMarket || isHistorical) return;
        // Small delay so user sees the round-end state briefly before switching
        const timer = setTimeout(() => {
            handleGoToNextMarket();
        }, 2000);
        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nextMarket, isHistorical]);

    const handleGoToNextMarket = () => {
        haptic('medium');
        if (!nextMarket) return;
        
        // Clear all stale states
        setPositions([]);
        polymarketWs.clearPositions();
        
        // Switch to the new market
        activeMarketRef.current = nextMarket;
        nextMarketRef.current = null;
        setActiveMarket(nextMarket);
        if (nextMarket.yesPrice && nextMarket.noPrice) {
            setYesPrice(nextMarket.yesPrice);
            setNoPrice(nextMarket.noPrice);
        }
        setNextMarket(null);
        
        // Reload fresh data for the new round synchronously
        loadData();
    };

    const handleGoToLiveMarket = async () => {
        haptic('medium');
        showToast("Refreshing live market...", "info");
        try {
            const snap = await api.predictions.getSnapshot();
            if (snap.market) {
                const currentMarket = activeMarketRef.current;
                if (currentMarket && snap.market.slug !== currentMarket.slug) {
                    // Switch to the new market
                    activeMarketRef.current = snap.market;
                    nextMarketRef.current = null;
                    setActiveMarket(snap.market);
                    if (snap.market.yesPrice && snap.market.noPrice) {
                        setYesPrice(snap.market.yesPrice);
                        setNoPrice(snap.market.noPrice);
                    }
                    setNextMarket(null);
                    // Clear all stale states
                    setPositions([]);
                    polymarketWs.clearPositions();
                    showToast("Switched to live round!", "success");
                } else {
                    const endsAt = new Date(snap.market.endsAt).getTime();
                    if (Date.now() >= endsAt) {
                        showToast("Next round is starting, please wait a few seconds...", "info");
                    } else {
                        showToast("Market refreshed!", "success");
                    }
                }
            }
            // Reload all data
            await loadData();
        } catch (e) {
            console.error(e);
            showToast("Failed to refresh live market", "error");
        }
    };

    const isLiveEnded = selectedRound === -1 && (timeLeft.mins === '00' && timeLeft.secs === '00' || !!nextMarket);

    const currentRoundTrades = (() => {
        if (selectedRound !== -1) {
            const round = history[selectedRound];
            if (!round) return [];
            return trades.filter(t => t.timestamp >= round.timestamp && t.timestamp < round.timestamp + 300000);
        }
        if (isLiveEnded && activeMarket) {
            const targetMs = new Date(activeMarket.endsAt).getTime() - 300000;
            return trades.filter(t => t.timestamp >= targetMs && t.timestamp < targetMs + 300000);
        }
        return recentTrades;
    })();

    useEffect(() => { loadData(); }, [loadData]);

    // TradingView has been removed in favor of native SVG PredictChart

    const isRoundSelected = selectedRound !== -1 && selectedRound !== -99;
    const selectedRoundData = isRoundSelected ? history[selectedRound] : null;

    const displayPtb  = selectedRound === -1 ? priceToBeat : selectedRound === -99 ? 0 : (selectedRoundData?.open || 0);
    const closePrice  = selectedRoundData ? (selectedRoundData.close || 0) : livePrice;
    const priceDelta  = selectedRoundData 
        ? (closePrice > 0 && displayPtb > 0 ? closePrice - displayPtb : 0)
        : (livePrice > 0 && displayPtb > 0 ? livePrice - displayPtb : 0);
    const isUp        = selectedRoundData
        ? (selectedRoundData.outcome ? selectedRoundData.outcome === 'UP' : priceDelta >= 0)
        : (priceDelta >= 0);
    const deltaAbs    = Math.abs(priceDelta);

    const computedYesBuy = yesPrice.buyPrice;
    const computedNoBuy = noPrice.buyPrice;

    const potentialPayout = betAmount && parseFloat(betAmount) > 0
        ? (parseFloat(betAmount) / (betType === 'UP' ? computedYesBuy : computedNoBuy)).toFixed(2)
        : '0.00';

    // ── Handlers ────────────────────────────────────────────────────────────
    const handleQuickAmount = (v: string) => {
        haptic('light');
        if (v === 'Max') { setBetAmount(parseFloat(cashBalance).toFixed(2)); return; }
        setBetAmount(prev => (parseFloat(prev || '0') + parseFloat(v)).toFixed(2));
    };

    const handlePlacePrediction = async () => {
        haptic('medium');
        if (!betAmount || parseFloat(betAmount) <= 0) { showToast('Enter a valid amount', 'warning'); return; }
        
        const defaultPrice = tradeType === 'buy' 
            ? (betType === 'UP' ? yesPrice.buyPrice : noPrice.buyPrice)
            : (betType === 'UP' ? yesPrice.sellPrice : noPrice.sellPrice);
        const finalPrice = orderType === 'LIMIT' && limitPrice && parseFloat(limitPrice) > 0 ? parseFloat(limitPrice) / 100 : defaultPrice;

        const inputAmount = parseFloat(betAmount);
        
        // Calculate costUsd and shareQty
        let costUsd: number;
        let shareQty: number;

        if (tradeType === 'buy') {
            if (orderType === 'LIMIT') {
                shareQty = inputAmount; // input is shares
                costUsd = inputAmount * finalPrice;
            } else {
                costUsd = inputAmount; // input is USD
                shareQty = inputAmount / finalPrice;
            }
            if (costUsd > parseFloat(cashBalance)) { showToast('Insufficient cash balance', 'warning'); return; }
        } else {
            shareQty = inputAmount; // input is shares
            costUsd = inputAmount * finalPrice; // cost/value returned
            const availableShares = positions.find(p => p.outcome === betType)?.qty || 0;
            if (shareQty > availableShares) { showToast('Insufficient shares to sell', 'warning'); return; }
        }
        
        setPlacingBet(true);
        setBetSlowMsg('');
        const slowTimer = setTimeout(() => setBetSlowMsg('Setting up wallet…'), 3000);
        try {
            // For backend `placeBet`, amountUsdc should be `costUsd` for BUY, and `shareQty` for SELL.
            const apiAmount = tradeType === 'buy' ? costUsd : shareQty;

            const res = await api.predictions.placeBet(
                apiAmount, betType,
                finalPrice,
                tradeType.toUpperCase() as 'BUY'|'SELL',
                orderType
            );
            clearTimeout(slowTimer);
            if (res.success) { 
                showToast('Prediction placed!', 'success');
                // Optimistically update cash balance
                if (orderType === 'MARKET') {
                    if (tradeType === 'buy') {
                        setCashBalance(prev => (parseFloat(prev || '0') - costUsd).toFixed(2));
                    } else {
                        setCashBalance(prev => (parseFloat(prev || '0') + costUsd).toFixed(2));
                    }

                    // Construct optimistic trade and prepend to history
                    const tempTrade: Trade = {
                        id: `temp-${Date.now()}`,
                        side: tradeType.toUpperCase(),
                        outcome: betType,
                        qty: shareQty,
                        price: finalPrice,
                        cost: costUsd,
                        timestamp: Date.now()
                    };
                    setRecentTrades(prev => [tempTrade, ...prev]);
                    setTrades(prev => [tempTrade, ...prev]);

                    // Optimistically update positions via polymarketWs to show instantly in active positions and net position cards
                    const activeMarket = activeMarketRef.current;
                    if (activeMarket) {
                        const tokenId = betType === 'UP' ? activeMarket.yesTokenId : activeMarket.noTokenId;
                        if (tradeType === 'buy') {
                            polymarketWs.optimisticBuy(tokenId, betType, shareQty, finalPrice, activeMarket.slug);
                        } else {
                            polymarketWs.optimisticSell(tokenId, shareQty);
                        }
                    }
                } else {
                    setTimeout(loadOpenOrders, 1000);
                }

                setBetAmount(''); 
                
                // Delay backend fetch to allow relayer to settle funds
                setTimeout(loadData, 3000);
            }
            else showToast('Failed to place prediction', 'error');
        } catch (e: any) { clearTimeout(slowTimer); showToast(e.message || 'Order failed', 'error'); }
        finally { setPlacingBet(false); setBetSlowMsg(''); }
    };

    const handleOpenDeposit = async () => {
        haptic('selection'); setDepositModalMode('deposit'); setShowDepositModal(true);
        if (!depositAddress || !evmBridgeAddress) {
            setDepositWalletLoading(true);
            try { 
                const r = await api.predictions.getDepositWallet(); 
                if (r) {
                    if (r.address) setDepositAddress(r.address);
                    if (r.evmBridgeAddress) setEvmBridgeAddress(r.evmBridgeAddress);
                }
            }
            catch { showToast('Failed to get deposit address', 'error'); }
            finally { setDepositWalletLoading(false); }
        }
    };

    const handleGaslessWithdraw = async () => {
        haptic('medium');
        if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) { showToast('Enter amount', 'warning'); return; }
        if (parseFloat(withdrawAmount) > parseFloat(cashBalance)) { showToast('Insufficient balance', 'warning'); return; }
        if (!withdrawRecipient) { showToast('Enter recipient address', 'warning'); return; }
        setWithdrawLoading(true);
        try {
            const r = await api.predictions.withdrawGasless(parseFloat(withdrawAmount), '137', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', withdrawRecipient);
            showToast(`Withdrawn! ${r.txHash?.slice(0, 10)}...`, 'success');
            setWithdrawAmount(''); setShowWithdrawModal(false); loadData();
        } catch (e: any) { showToast(e.message || 'Withdrawal failed', 'error'); }
        finally { setWithdrawLoading(false); }
    };

    const handleOpenWithdraw = () => {
        haptic('selection');
        setDepositModalMode('withdraw');
        setShowDepositModal(true);
    };

    const handleShareMarket = () => {
        haptic('light');
        const url = `https://polymarket.com/event/btc-updown-5m`;
        if (navigator.share) {
            navigator.share({ title: 'BTC Up or Down 5m', url }).catch(() => {});
        } else {
            navigator.clipboard.writeText(url);
            showToast('Market link copied!', 'success');
        }
    };

    const handleCopyMarketLink = () => {
        haptic('light');
        navigator.clipboard.writeText('https://polymarket.com/event/btc-updown-5m');
        showToast('Link copied!', 'success');
    };

    const displayedRounds = history.slice(0, 4);

    if (loading && cashBalance === '0.00') {
        return (
            <div className="pm-page">
                <header className="pm-topbar">
                    <div className="pm-topbar-metrics">
                        <div className="pm-skeleton-metric" />
                        <div className="pm-skeleton-metric" />
                    </div>
                </header>
                <div className="pm-skeleton-body">
                    <div className="pm-skeleton-chart" />
                    <div className="pm-skeleton-panel" />
                </div>
            </div>
        );
    }
    const openOrdersValue = openOrders.reduce((acc, order) => {
        if (order.side === 'BUY') {
            const size = parseFloat(order.size || order.original_size || '0');
            const price = parseFloat(order.price || '0');
            return acc + (size * price);
        }
        return acc;
    }, 0);

    const positionsValue = positions.reduce((acc, pos) => acc + (pos.qty * (pos.outcome === 'UP' ? yesPrice.buyPrice : noPrice.buyPrice)), 0);
    const portfolioTotal = parseFloat(cashBalance || '0') + unclaimedWinnings + positionsValue + openOrdersValue;

    return (
        <div className="pm-page">

            {/* ══ TOP BAR ══════════════════════════════════════════════════ */}
            <header className="pm-topbar">
                <div className="pm-topbar-metrics">
                    <div className="pm-metric">
                        <span className="pm-metric-label">PORTFOLIO</span>
                        <span className={`pm-metric-value pm-green ${isClaiming ? 'pm-balance-pulsing' : ''}`}>${portfolioTotal.toFixed(2)}</span>
                    </div>
                    <div className="pm-metric">
                        <span className="pm-metric-label">CASH</span>
                        <span className={`pm-metric-value pm-green ${isClaiming ? 'pm-balance-pulsing' : ''}`}>${parseFloat(cashBalance).toFixed(2)}</span>
                    </div>
                    {unclaimedWinnings > 0 && (
                        <div className="pm-metric">
                            <span className="pm-metric-label">UNCLAIMED</span>
                            <span className="pm-metric-value pm-green">${unclaimedWinnings.toFixed(2)}</span>
                        </div>
                    )}
                </div>
                <div className="pm-topbar-actions">
                    <button className="pm-btn-deposit" onClick={handleOpenDeposit} id="btn-deposit">Deposit</button>
                    
                    <div style={{ position: 'relative' }}>
                        <button className="pm-icon-btn pm-bell-btn" onClick={() => { haptic('light'); setShowNotifications(!showNotifications); }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                            </svg>
                            <span className="pm-bell-dot"/>
                        </button>
                        
                        {showNotifications && (
                            <div className="pm-notif-dropdown">
                                <div className="pm-notif-header">Notifications</div>
                                <div className="pm-notif-list">
                                    {trades.length === 0 ? (
                                        <div className="pm-notif-empty">No notifications</div>
                                    ) : (
                                        trades.map((t) => (
                                            <div key={t.id} className="pm-notif-item" style={{ cursor: 'pointer' }} onClick={() => {
                                                haptic('light');
                                                const windowStartSeconds = Math.floor((t.timestamp || Date.now()) / 300000) * 300;
                                                navigate(`/predict/btc-updown-5m-${windowStartSeconds}`);
                                                setShowNotifications(false);
                                            }}>
                                                <div className="pm-btc-icon-sq pm-notif-btc">₿</div>
                                                <div className="pm-notif-content">
                                                    <div className="pm-notif-top">
                                                        <span className="pm-notif-title">{String(t.side).toUpperCase() === 'BUY' ? `Buy ${t.outcome === 'UP' ? 'Up' : 'Down'}` : `Sell ${t.outcome === 'UP' ? 'Up' : 'Down'}`}</span>
                                                        <div className="pm-notif-time">
                                                            {timeAgo(t.timestamp)}
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft: 6, opacity: 0.6}}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                                        </div>
                                                    </div>
                                                    <div className="pm-notif-market">Bitcoin Up or Down - {new Date(t.timestamp).toLocaleString([], {month: 'short', day: 'numeric'})}, {new Date(t.timestamp).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}-{new Date(t.timestamp + 5*60000).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}</div>
                                                    <div className="pm-notif-detail">{String(t.side).toUpperCase() === 'BUY' ? `${t.qty} shares @ ${(t.price * 100).toFixed(1)}¢` : `Sold ${t.qty} shares for $${(t.cost).toFixed(2)}`}</div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ position: 'relative' }}>
                        <div className="pm-profile-btn" onClick={() => { haptic('light'); setShowProfileMenu(!showProfileMenu); setShowNotifications(false); }}>
                            <div className="pm-avatar-blue"/>
                            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="#848e9c" strokeWidth="1.5"><path d="M1 1l4 4 4-4"/></svg>
                        </div>

                        {showProfileMenu && (
                            <div className="pm-notif-dropdown pm-profile-dropdown" style={{ width: '240px', right: '0' }}>
                                <div className="pm-notif-header" style={{ padding: '12px 16px', fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ color: '#848e9c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Hot Wallet Address</div>
                                    <div 
                                        style={{ fontFamily: 'SF Mono, monospace', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '4px 0' }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (depositAddress) {
                                                haptic('light');
                                                const copyFallback = () => {
                                                    const el = document.createElement('textarea');
                                                    el.value = depositAddress;
                                                    document.body.appendChild(el);
                                                    el.select();
                                                    document.execCommand('copy');
                                                    document.body.removeChild(el);
                                                    showToast('Address copied!', 'success');
                                                };
                                                if (navigator.clipboard && navigator.clipboard.writeText) {
                                                    navigator.clipboard.writeText(depositAddress)
                                                        .then(() => showToast('Address copied!', 'success'))
                                                        .catch(copyFallback);
                                                } else {
                                                    copyFallback();
                                                }
                                            }
                                        }}
                                    >
                                        {depositAddress ? `${depositAddress.slice(0, 6)}...${depositAddress.slice(-4)}` : '0x...'}
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#848e9c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    </div>
                                </div>
                                <div className="pm-notif-list">
                                    <div className="pm-notif-item" onClick={() => { navigate('/predict-profile'); }} style={{ padding: '12px 16px' }}>
                                        <span className="pm-notif-title">Positions & Orders</span>
                                    </div>
                                    <div className="pm-notif-item" onClick={() => { navigate('/predict-leaderboard'); }} style={{ padding: '12px 16px' }}>
                                        <span className="pm-notif-title">Leaderboard</span>
                                    </div>
                                    <div className="pm-notif-item" onClick={() => { navigate('/predict-copy-trading'); }} style={{ padding: '12px 16px' }}>
                                        <span className="pm-notif-title">Copy Trading</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* ══ MARKET CARD (chart + timeline + positions inside) ════════ */}
            <div className="pm-market-card">

                {/* Title row */}
                <div className="pm-card-title-row">
                    <div className="pm-card-title-left">
                        {/* Rounded-square BTC icon */}
                        <div className="pm-btc-icon-sq">₿</div>
                        <div>
                            <h2 className="pm-market-name">BTC Up or Down 5m</h2>
                            <p className="pm-market-sub" style={{ color: betType === 'UP' ? '#0ecb81' : '#f6465d', fontWeight: 600 }}>
                                {betType === 'UP' ? 'Up' : 'Down'}
                            </p>
                        </div>
                    </div>
                </div>



                {/* Price metrics + timer */}
                <div className="pm-price-row">
                    <div className="pm-price-block">
                        <span className="pm-price-label" style={{textTransform: 'none', color: '#848e9c', fontWeight: 500, fontSize: '10px'}}>Price to Beat</span>
                        <span className="pm-price-val" style={{fontSize: '18px'}}>${displayPtb.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                    </div>
                    <div className="pm-price-block pm-price-block-current" style={{borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '12px', marginLeft: '6px', borderRadius: '4px'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px'}}>
                            <span className={isUp ? 'pm-green' : 'pm-red'} style={{textTransform: 'none', fontWeight: 500, fontSize: '11px'}}>
                                {selectedRoundData ? 'Close Price' : 'Current Price'}
                            </span>
                            {displayPtb > 0 && (
                                <span className={isUp ? 'pm-green' : 'pm-red'} style={{fontSize: '11px', fontWeight: 600}}>
                                    {isUp ? '▲' : '▼'} ${deltaAbs.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:2})}
                                </span>
                            )}
                        </div>
                        <div className="pm-price-current-row" style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                            <span className={`pm-price-val ${isUp ? 'pm-green' : 'pm-red'}`} style={{fontSize: '20px'}}>
                                ${closePrice.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
                            </span>
                            {selectedRoundData && (
                                <span style={{
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    color: '#fff',
                                    backgroundColor: isUp ? 'rgba(14,203,129,0.2)' : 'rgba(246,70,93,0.2)',
                                    border: `1px solid ${isUp ? '#0ecb81' : '#f6465d'}`,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '2px',
                                    height: 'fit-content'
                                }}>
                                    Resolved {isUp ? 'UP' : 'DOWN'}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="pm-timer-block">
                        {selectedRound !== -1 ? (
                            <button className="pm-go-live-btn" onClick={() => { haptic('selection'); navigate('/predict'); setSelectedRound(-1); }}>
                                <span className="pm-live-dot"/> Go to live market &gt;
                            </button>
                        ) : isLiveEnded && nextMarket ? (
                            <button className="pm-go-live-btn" onClick={handleGoToNextMarket} style={{ background: 'var(--pm-green)', color: '#000', border: 'none', boxShadow: '0 0 10px rgba(14,203,129,0.3)' }}>
                                <span className="pm-live-dot" style={{ backgroundColor: '#000', animation: 'none' }}/> Next Market &gt;
                            </button>
                        ) : isLiveEnded ? (
                            <button className="pm-go-live-btn" onClick={handleGoToLiveMarket} style={{ background: 'var(--pm-green)', color: '#000', border: 'none', boxShadow: '0 0 10px rgba(14,203,129,0.3)' }}>
                                <span className="pm-live-dot" style={{ backgroundColor: '#000', animation: 'none' }}/> Go to Live Market &gt;
                            </button>
                        ) : (
                            <div className="pm-timer" style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0px'}}>
                                <div className="pm-simple-timer">
                                    <div className="pm-simple-timer-unit">
                                        <div className="pm-simple-timer-val">{timeLeft.mins}</div>
                                        <div className="pm-simple-timer-lbl">MIN</div>
                                    </div>
                                    <div className="pm-simple-timer-unit">
                                        <div className="pm-simple-timer-val">
                                            <span key={`s0-${timeLeft.secs[0]}`} style={{ display: 'inline-block', animation: 'pmTimerTick 0.15s ease-out' }}>
                                                {timeLeft.secs[0]}
                                            </span>
                                            <span key={`s1-${timeLeft.secs[1]}`} style={{ display: 'inline-block', animation: 'pmTimerTick 0.15s ease-out' }}>
                                                {timeLeft.secs[1]}
                                            </span>
                                        </div>
                                        <div className="pm-simple-timer-lbl">SECS</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Chart */}
                <div className="pm-chart-wrap">

                    <div className="pm-chart" style={{ flex: 1, position: 'relative' }}>
                        <TradingViewChart />
                    </div>
                </div>

                {/* Timeline */}
                <div className="pm-timeline">
                    <div className="pm-tl-scroll">
                        <div className="pm-tl-past-group">
                            <button className="pm-tl-meta-btn" onClick={() => { haptic('light'); setHistoryPage(p => p + 1); showToast('Loading older rounds...', 'info'); }}>
                                Past <svg width="8" height="5" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 1l4 4 4-4"/></svg>
                            </button>
                            <div className="pm-tl-divider"></div>
                            <div className="pm-tl-red-arrows">
                                {[-5, -4, -3].map((offset) => {
                                    if (!liveEndMs) return null;
                                    const targetMs = liveEndMs + (offset * 300000);
                                    const historyIndex = Math.abs(offset);
                                    const h = history.find(r => r.timestamp === targetMs - 300000);
                                    const outcome = h ? h.outcome : 'UP';
                                    return (
                                        <button key={`arrow-${offset}`} className={`pm-tl-circle-btn ${outcome === 'UP' ? 'pm-tl-circle-up' : 'pm-tl-circle-down'}`}
                                            onClick={() => { haptic('selection'); setSelectedRound(historyIndex); }}>
                                            {outcome === 'UP' ? (
                                                <svg width="6" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 5l4-4 4 4"/></svg>
                                            ) : (
                                                <svg width="6" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 1l4 4 4-4"/></svg>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {[-2, -1].map((offset) => {
                            if (!liveEndMs) return null;
                            const targetMs = liveEndMs + (offset * 300000);
                            const historyIndex = Math.abs(offset);
                            const h = history.find(r => r.timestamp === targetMs - 300000);
                            const outcome = h ? h.outcome : null;
                            return (
                                <button key={`past-${offset}`} id={`round-${historyIndex}`}
                                    className={`pm-tl-pill ${selectedRound === historyIndex ? 'pm-tl-pill-active' : ''}`}
                                    onClick={() => { haptic('selection'); setSelectedRound(historyIndex); }}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                    {outcome && (
                                        <span style={{ 
                                            color: outcome === 'UP' ? '#0ecb81' : '#f6465d',
                                            fontWeight: 'bold',
                                            fontSize: '11px',
                                            display: 'inline-flex',
                                            alignItems: 'center'
                                        }}>
                                            {outcome === 'UP' ? '▲' : '▼'}
                                        </span>
                                    )}
                                    {new Date(targetMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                </button>
                            );
                        })}
                        
                        <button className={`pm-tl-pill ${selectedRound === -1 ? 'pm-tl-pill-active' : ''}`}
                            onClick={() => { haptic('selection'); navigate('/predict'); setSelectedRound(-1); }} id="round-live">
                            <span className="pm-tl-live-dot" style={{marginRight: 6}}/> 
                            {liveEndMs ? new Date(liveEndMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Live'}
                        </button>
                        
                        {[1].map((offset) => (
                            <button key={`fut-${offset}`} id="round-future"
                                className={`pm-tl-pill ${selectedRound === -99 ? 'pm-tl-pill-active' : ''}`}
                                style={{ opacity: selectedRound === -99 ? 1 : 0.6 }}
                                onClick={() => { haptic('selection'); setSelectedRound(-99); }}>
                                {liveEndMs ? new Date(liveEndMs + (offset * 300000)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '...'}
                            </button>
                        ))}

                        <button className="pm-tl-meta-btn" onClick={() => { haptic('light'); showToast('Coming soon: more rounds!', 'info'); }}>
                            More <svg width="8" height="5" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 1l4 4 4-4"/></svg>
                        </button>
                    </div>
                </div>

                {/* ── LIVE POSITIONS (inside market card, under chart) */}
                <div className="pm-inline-positions">
                    <div className="pm-inline-pos-header">
                        <span className="pm-inline-pos-title">Positions</span>
                        <button className="pm-view-net-btn" onClick={() => { haptic('light'); setShowNetPositions(v => !v); }} id="btn-view-net">
                            {showNetPositions ? 'Hide Net' : 'View Net Positions'}
                        </button>
                    </div>
                    {showNetPositions && positions.length > 0 && (
                        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                            <div style={{ fontSize: 12, color: '#848e9c', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Position Summary</div>
                            {(['UP', 'DOWN'] as const).map(side => {
                                const sidePnl = positions.filter(p => p.outcome === side);
                                if (sidePnl.length === 0) return null;
                                const totalQty = sidePnl.reduce((s, p) => s + p.qty, 0);
                                const totalCost = sidePnl.reduce((s, p) => s + p.cost, 0);
                                const totalValue = sidePnl.reduce((s, p) => s + p.value, 0);
                                const netReturn = totalValue - totalCost;
                                return (
                                    <div key={side} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span className={`pm-pos-outcome-badge ${side === 'UP' ? 'pm-pos-badge-up' : 'pm-pos-badge-down'}`}>{side === 'UP' ? '▲ Up' : '▼ Down'}</span>
                                            <span className="pm-mono" style={{ color: '#848e9c', fontSize: 12 }}>{totalQty.toFixed(2)} shares</span>
                                        </span>
                                        <span className={`pm-mono ${netReturn >= 0 ? 'pm-green' : 'pm-red'}`} style={{ fontWeight: 700 }}>
                                            {netReturn >= 0 ? '+' : ''}${netReturn.toFixed(2)}
                                        </span>
                                    </div>
                                );
                            })}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12 }}>
                                <span style={{ color: '#848e9c' }}>Total Invested</span>
                                <span className="pm-mono">${positions.reduce((s, p) => s + p.cost, 0).toFixed(2)}</span>
                            </div>
                        </div>
                    )}
                    {positions.length === 0 ? (
                        <div className="pm-positions-empty">No current position</div>
                    ) : (
                        <>
                            <div className="pm-pos-table-head">
                                <span>OUTCOME</span><span>QTY</span><span>AVG</span><span>VALUE</span><span>RETURN</span><span></span>
                            </div>
                            {positions.map((pos, idx) => (
                                <div key={idx} className="pm-pos-row" id={`pos-row-${pos.outcome.toLowerCase()}`}>
                                    <div>
                                        <span className={`pm-pos-outcome-badge ${pos.outcome === 'UP' ? 'pm-pos-badge-up' : 'pm-pos-badge-down'}`}>
                                            {pos.outcome === 'UP' ? '▲ Up' : '▼ Down'}
                                        </span>
                                    </div>
                                    <span className="pm-mono">{typeof pos.qty === 'number' ? pos.qty.toFixed(2) : pos.qty}</span>
                                    <span className="pm-mono">{(pos.avg * 100).toFixed(2)}¢</span>
                                    <div className="pm-pos-col-value">
                                        <span className="pm-pos-value-main pm-mono">${(pos.qty * (pos.outcome === 'UP' ? yesPrice.buyPrice : noPrice.buyPrice)).toFixed(2)}</span>
                                        <span className="pm-pos-cost-sub">Cost ${pos.cost.toFixed(2)}</span>
                                    </div>
                                    <div>
                                        {(() => {
                                            const dynamicValue = pos.qty * (pos.outcome === 'UP' ? yesPrice.buyPrice : noPrice.buyPrice);
                                            const dynamicReturnAmt = dynamicValue - pos.cost;
                                            const dynamicReturnPct = pos.cost > 0 ? (dynamicReturnAmt / pos.cost) * 100 : 0;
                                            return (
                                                <span className={`pm-pos-return-val ${dynamicReturnAmt >= 0 ? 'pm-green' : 'pm-red'}`}>
                                                    {dynamicReturnAmt >= 0 ? '+' : ''}${dynamicReturnAmt.toFixed(2)}
                                                    <span className="pm-pos-return-pct"> ({dynamicReturnPct >= 0 ? '+' : ''}{dynamicReturnPct.toFixed(2)}%)</span>
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    <div className="pm-pos-col-action">
                                        <button className="pm-pos-sell-btn" id={`btn-sell-${idx}`}
                                            onClick={() => { haptic('medium'); setBetType(pos.outcome); setTradeType('sell'); setBetAmount(pos.qty.toString()); }}>
                                            Sell
                                        </button>
                                        <button className="pm-pos-share-btn" onClick={() => haptic('light')}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                                                <polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>

                {/* ── OPEN ORDERS ── */}
                <div className="pm-inline-positions" style={{ marginTop: '16px' }}>
                    <div className="pm-inline-pos-header">
                        <span className="pm-inline-pos-title" style={{ fontSize: '16px' }}>Open Orders</span>
                    </div>
                    {openOrders.length === 0 ? (
                        <div className="pm-positions-empty" style={{ padding: '16px', textAlign: 'center', color: '#848e9c', fontSize: '13px' }}>No open orders</div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', minWidth: '350px', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ color: '#848e9c', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <th style={{ padding: '8px 4px', fontWeight: 600, fontSize: '10px' }}>SIDE</th>
                                        <th style={{ padding: '8px 4px', fontWeight: 600, fontSize: '10px' }}>OUTCOME</th>
                                        <th style={{ padding: '8px 4px', fontWeight: 600, fontSize: '10px' }}>PRICE</th>
                                        <th style={{ padding: '8px 4px', fontWeight: 600, fontSize: '10px' }}>FILLED</th>
                                        <th style={{ padding: '8px 4px', fontWeight: 600, fontSize: '10px' }}>TOTAL</th>
                                        <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>
                                            <button onClick={() => handleCancelOrder('ALL')} disabled={cancelingOrder !== null} style={{ background: 'transparent', border: 'none', color: '#f6465d', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', textTransform: 'uppercase' }}>
                                                {cancelingOrder === 'ALL' ? 'Canceling...' : 'Cancel All'}
                                            </button>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {openOrders.map((order: any, i: number) => {
                                        const isBuy = order.side === 'BUY';
                                        let isUp = true;
                                        if (activeMarket) {
                                            const assetLc = (order.asset_id || order.asset || '').toLowerCase();
                                            isUp = assetLc === activeMarket.yesTokenId.toLowerCase();
                                        }
                                        const price = parseFloat(order.price) * 100;
                                        const size = parseFloat(order.size || order.original_size || "0");
                                        const filled = parseFloat(order.size_matched || "0");
                                        const total = size * parseFloat(order.price);
                                        
                                        return (
                                            <tr key={order.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                <td style={{ padding: '12px 4px', color: '#fff' }}>{isBuy ? 'Buy' : 'Sell'}</td>
                                                <td style={{ padding: '12px 4px' }}>
                                                    <span className={`pm-pos-outcome-badge ${isUp ? 'pm-pos-badge-up' : 'pm-pos-badge-down'}`} style={{ padding: '2px 6px', fontSize: '11px', background: isUp ? 'rgba(14,203,129,0.1)' : 'rgba(246,70,93,0.1)' }}>
                                                        {isUp ? 'Up' : 'Down'}
                                                    </span>
                                                </td>
                                                <td className="pm-mono" style={{ padding: '12px 4px', color: '#fff' }}>{price.toFixed(0)}¢</td>
                                                <td className="pm-mono" style={{ padding: '12px 4px', color: '#fff' }}>{filled} / {size}</td>
                                                <td className="pm-mono" style={{ padding: '12px 4px', color: '#fff' }}>${total.toFixed(2)}</td>
                                                <td style={{ padding: '12px 4px', textAlign: 'right' }}>
                                                    <button onClick={() => handleCancelOrder(order.id)} disabled={cancelingOrder === order.id} style={{ background: 'transparent', border: 'none', color: '#848e9c', fontSize: '14px', cursor: 'pointer' }}>
                                                        {cancelingOrder === order.id ? <span className="pm-spinner pm-spinner-sm" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '✕'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* ══ TRADE BOX (Moved inside Market Card for unified layout) ════ */}
                <TradePanel
                    isUp={isUp}
                    yesPrice={yesPrice}
                    noPrice={noPrice}
                    cashBalance={cashBalance}
                    positions={positions}
                    selectedRound={selectedRound}
                    history={history}
                    trades={trades}
                    loadData={loadData}
                    onOutcomeChange={(outcome) => setBetType(outcome)}
                    tradeType={tradeType}
                    setTradeType={setTradeType}
                    betType={betType}
                    setBetType={setBetType}
                    betAmount={betAmount}
                    setBetAmount={setBetAmount}
                    orderType={orderType}
                    setOrderType={setOrderType}
                    limitPrice={limitPrice}
                    setLimitPrice={setLimitPrice}
                    claiming={isClaiming}
                    setClaiming={setIsClaiming}
                    isLiveEnded={isLiveEnded}
                    activeMarket={activeMarket}
                    onPlacePrediction={handlePlacePrediction}
                    placingBet={placingBet}
                    betSlowMsg={betSlowMsg}
                />

            </div>

            {/* ══ HISTORY CARD ════════════════════════════════════════════ */}
            <div className="pm-history-card">
                <div className="pm-history-header">
                    <span className="pm-history-title">History</span>
                </div>
                {currentRoundTrades.length === 0 ? (
                    <div className="pm-history-empty">No trades yet this round</div>
                ) : (
                    currentRoundTrades.map((t, idx) => (
                        <div key={t.id ?? idx} className="pm-history-row" id={`trade-${idx}`}>
                            <span className="pm-history-desc">
                                {String(t.side).toUpperCase() === 'BUY' ? 'Bought' : 'Sold'}{' '}
                                <span className="pm-mono">{t.qty.toFixed(2)}</span>{' '}
                                <span className={t.outcome === 'UP' ? 'pm-green' : 'pm-red'}>
                                    {t.outcome === 'UP' ? 'Up' : 'Down'}
                                </span>{' '}
                                at <span className="pm-mono">{(t.price * 100).toFixed(0)}¢</span>{' '}
                                <span className="pm-history-cost">(${t.cost.toFixed(2)})</span>
                            </span>
                            <span className="pm-history-time">{timeAgo(t.timestamp)}</span>
                        </div>
                    ))
                )}
            </div>

            {/* ══ DEPOSIT MODAL ═══════════════════════════════════════════ */}
            {showDepositModal && (
                <DepositModal 
                    initialMode={depositModalMode}
                    onClose={() => setShowDepositModal(false)}
                    balances={{ usdt: cashBalance, address: depositAddress, evmBridgeAddress: evmBridgeAddress }}
                    loadBalances={async () => {
                        setDepositWalletLoading(true);
                        try {
                            const b = await api.predictions.getBalance();
                            if (b && b.balance) setCashBalance(b.balance);
                            const r = await api.predictions.getDepositWallet();
                            if (r) {
                                if (r.address) setDepositAddress(r.address);
                                if (r.evmBridgeAddress) setEvmBridgeAddress(r.evmBridgeAddress);
                            }
                        } catch(e) {}
                        setDepositWalletLoading(false);
                    }}
                    copyAddress={(addr?: string) => { 
                        const toCopy = addr || depositAddress;
                        if (toCopy) { 
                            navigator.clipboard.writeText(toCopy); 
                            showToast('Copied!', 'success'); 
                        } 
                    }}
                    haptic={haptic}
                    onWithdraw={handleOpenWithdraw}
                />
            )}

            {/* ══ WITHDRAW MODAL ══════════════════════════════════════════ */}
            {showWithdrawModal && (
                <div className="pm-overlay" onClick={() => setShowWithdrawModal(false)}>
                    <div className="pm-modal" style={{ maxWidth: 380, borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
                        <div className="pm-modal-header" style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Withdraw pUSD</h3>
                            <button className="pm-modal-close" onClick={() => setShowWithdrawModal(false)}>×</button>
                        </div>
                        <div className="pm-modal-body" style={{ padding: 18 }}>
                            {/* Balance chip */}
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: '#848e9c', fontSize: 12 }}>Available Balance</span>
                                <span style={{ fontWeight: 700, color: '#4ade80', fontSize: 14 }}>${parseFloat(cashBalance).toFixed(2)} pUSD</span>
                            </div>

                            {/* Amount row with quick buttons */}
                            <label className="pm-field-label" style={{ fontSize: 11, color: '#848e9c', marginBottom: 6, display: 'block' }}>Amount (pUSD)</label>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                <input type="number" placeholder="0.00" value={withdrawAmount}
                                    onChange={e => setWithdrawAmount(e.target.value)}
                                    style={{ flex: 1, background: '#161920', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff', padding: '10px 12px', fontSize: 16, fontFamily: 'monospace', outline: 'none' }}/>
                                <button onClick={() => { haptic('light'); setWithdrawAmount(parseFloat(cashBalance).toFixed(2)); }}
                                    style={{ background: 'rgba(0,122,255,0.15)', border: '1px solid rgba(0,122,255,0.3)', borderRadius: 8, color: '#007aff', padding: '0 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>MAX</button>
                            </div>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                                {['25%', '50%', '75%'].map(pct => (
                                    <button key={pct} onClick={() => { haptic('light'); setWithdrawAmount((parseFloat(cashBalance) * parseInt(pct) / 100).toFixed(2)); }}
                                        style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#fff', padding: '6px 0', fontSize: 12, cursor: 'pointer' }}>{pct}</button>
                                ))}
                            </div>

                            <label className="pm-field-label" style={{ fontSize: 11, color: '#848e9c', marginBottom: 6, display: 'block' }}>Recipient Address</label>
                            <input type="text" placeholder="0x..." value={withdrawRecipient}
                                onChange={e => setWithdrawRecipient(e.target.value)}
                                style={{ width: '100%', boxSizing: 'border-box', background: '#161920', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff', padding: '10px 12px', fontSize: 12, fontFamily: 'monospace', outline: 'none', marginBottom: 6 }}/>
                            {user?.wallet_address && withdrawRecipient !== user.wallet_address && (
                                <button onClick={() => { haptic('light'); setWithdrawRecipient(user.wallet_address); }}
                                    style={{ background: 'none', border: 'none', color: '#007aff', fontSize: 11, cursor: 'pointer', padding: 0, marginBottom: 14 }}>
                                    ← Use my wallet ({user.wallet_address.slice(0,6)}...{user.wallet_address.slice(-4)})
                                </button>
                            )}

                            {/* Breakdown */}
                            {withdrawAmount && parseFloat(withdrawAmount) > 0 && (
                                <div style={{ background: '#161920', borderRadius: 10, padding: '12px 14px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#848e9c' }}>
                                        <span>You withdraw</span><span style={{ color: '#fff', fontWeight: 600 }}>{withdrawAmount} pUSD</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#848e9c' }}>
                                        <span>Fee</span><span style={{ color: '#4ade80', fontWeight: 600 }}>0.00%</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#848e9c', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
                                        <span>You receive</span><span style={{ color: '#4ade80', fontWeight: 700 }}>${parseFloat(withdrawAmount).toFixed(2)} USDC</span>
                                    </div>
                                </div>
                            )}

                            <button style={{ width: '100%', background: '#007aff', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: (withdrawLoading || !withdrawAmount || !withdrawRecipient) ? 0.5 : 1 }}
                                disabled={withdrawLoading || !withdrawAmount || !withdrawRecipient} onClick={handleGaslessWithdraw}>
                                {withdrawLoading ? 'Processing...' : 'Withdraw Gasless'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
