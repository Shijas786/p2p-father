import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPublicClient, http } from 'viem';
import { polygon } from 'viem/chains';
import { api } from '../lib/api';
import { polymarketWs } from '../lib/polymarketWs';
import { haptic } from '../lib/telegram';
import { useToast } from '../components/Toast';
import { PredictChart } from '../components/PredictChart';
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
    const [aiData, setAiData]         = useState<any>(null);
    const [loading, setLoading]       = useState(false);

    // Positions & trades
    const [positions, setPositions]   = useState<Position[]>([]);
    const [trades, setTrades]         = useState<Trade[]>([]);
    const [recentTrades, setRecentTrades] = useState<Trade[]>([]);

    // User Trade Actions
    const [tradeType, setTradeType]   = useState<'buy'|'sell'>('buy');
    const [betType, setBetType]       = useState<'UP'|'DOWN'>('UP');
    const [betAmount, setBetAmount]   = useState('');
    const [sellPercentage, setSellPercentage] = useState<number>(0);
    const [placingBet, setPlacingBet] = useState(false);
    
    // Notifications
    const [showNotifications, setShowNotifications] = useState(false);
    const [showProfileMenu, setShowProfileMenu] = useState(false);

    // Modals
    const [showDepositModal, setShowDepositModal]     = useState(false);
    const [depositModalMode, setDepositModalMode]     = useState<'deposit'|'withdraw'>('deposit');
    const [showWithdrawModal, setShowWithdrawModal]   = useState(false);
    const [depositAddress, setDepositAddress]         = useState('');
    const [depositWalletLoading, setDepositWalletLoading] = useState(false);
    const [withdrawAmount, setWithdrawAmount]         = useState('');
    const [withdrawRecipient, setWithdrawRecipient]   = useState('');
    const [withdrawLoading, setWithdrawLoading]       = useState(false);
    const [showNetPositions, setShowNetPositions]     = useState(false);
    const [historyPage, setHistoryPage]               = useState(0);

    const chartRef = useRef<HTMLDivElement>(null);

    // ── Load all data ───────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        setLoading(true);
        
        // Fire slow background calls independently so they don't block the UI
        api.predictions.getAIAnalysis()
            .then(aiRes => setAiData(aiRes))
            .catch(console.error);
            
        api.predictions.getTrades('?all=true')
            .then(res => setTrades(res.trades ?? []))
            .catch(console.error);
            
        api.predictions.getTrades()
            .then(res => setRecentTrades(res.trades ?? []))
            .catch(console.error);

        try {
            // Await only the critical fast calls
            const [histRes, balRes, posRes, depRes, marketRes] = await Promise.allSettled([
                api.predictions.getHistory(),
                api.predictions.getBalance(),
                api.predictions.getPositions(),
                api.predictions.getDepositWallet(),
                api.predictions.getMarket(),
            ]);

            if (histRes.status === 'fulfilled' && histRes.value?.history) {
                const parsed: Round[] = histRes.value.history.map((h: any) => ({
                    time: h.time, open: h.open, close: h.close,
                    outcome: h.outcome, timestamp: h.timestamp,
                }));
                setHistory(parsed);
                if (parsed.length > 0) setPriceToBeat(parsed[0].close || parsed[0].open || 0);
            }
            if (balRes.status === 'fulfilled') setCashBalance(balRes.value.balance);
            if (posRes.status === 'fulfilled') setPositions(posRes.value.positions ?? []);
            if (depRes.status === 'fulfilled') setDepositAddress(depRes.value.address ?? '');
            
            // Sync WebSocket with backend positions to remove duplicates
            if (posRes.status === 'fulfilled' && posRes.value?.positions) {
                // Remove ws positions that are now in data API
                const activeBtcMarket = marketRes.status === 'fulfilled' ? marketRes.value.market : null;
                if (activeBtcMarket) {
                    const syncedAssets: string[] = [];
                    for (const p of posRes.value.positions) {
                        if (p.outcome === 'UP') syncedAssets.push(activeBtcMarket.yesTokenId);
                        if (p.outcome === 'DOWN') syncedAssets.push(activeBtcMarket.noTokenId);
                    }
                    polymarketWs.syncWithBackend(syncedAssets);
                }
                
                // Merge WS positions into data API positions
                const basePositions = posRes.value.positions;
                const wsPositions = polymarketWs.getPositions();
                for (const wsPos of wsPositions) {
                    if (!activeBtcMarket) continue;
                    
                    const assetLc = wsPos.asset.toLowerCase();
                    const isYes = assetLc === activeBtcMarket.yesTokenId.toLowerCase();
                    const isNo = assetLc === activeBtcMarket.noTokenId.toLowerCase();
                    
                    if (!isYes && !isNo) continue; // Skip stale positions from old markets

                    const mappedOutcome = isYes ? 'UP' : 'DOWN';

                    const idx = basePositions.findIndex(p => p.outcome === mappedOutcome);
                    if (idx >= 0) {
                        const oldQty = basePositions[idx].qty;
                        basePositions[idx].qty += wsPos.size; // wsPos.size is negative on sell
                        
                        if (wsPos.size < 0 && oldQty > 0) {
                            // On sell, deduct cost proportionally
                            const avgCost = basePositions[idx].cost / oldQty;
                            basePositions[idx].cost -= Math.abs(wsPos.size) * avgCost;
                        } else {
                            // On buy, add cost at execution price
                            basePositions[idx].cost += wsPos.size * wsPos.price;
                        }

                        basePositions[idx].value += wsPos.size * basePositions[idx].currentPrice;
                        basePositions[idx].avg = basePositions[idx].qty > 0 ? basePositions[idx].cost / basePositions[idx].qty : 0;
                    } else {
                        basePositions.push({
                            outcome: mappedOutcome,
                            qty: wsPos.size,
                            avg: wsPos.price,
                            currentPrice: wsPos.price,
                            cost: wsPos.size * wsPos.price,
                            value: wsPos.size * (mappedOutcome === 'UP' ? yesPrice.buyPrice : noPrice.buyPrice),
                            returnAmt: 0,
                            returnPct: 0
                        });
                    }
                }
                
                // Filter out any positions that have been fully sold (qty <= 0)
                posRes.value.positions = basePositions.filter(p => p.qty > 0.001);

                setPositions(posRes.value.positions);
            }

        } catch (e) { console.error('[Predict] loadData fatal error:', e); }
        finally { setLoading(false); }
    }, []);

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
                            for (const wsPos of wsPositions) {
                                const idx = newPos.findIndex(p => p.outcome === wsPos.outcome);
                                if (idx >= 0) {
                                    newPos[idx].qty = wsPos.size;
                                    newPos[idx].value = wsPos.size * newPos[idx].currentPrice;
                                } else {
                                    newPos.push({
                                        outcome: wsPos.outcome as 'UP'|'DOWN',
                                        qty: wsPos.size,
                                        avg: wsPos.price,
                                        currentPrice: wsPos.price,
                                        cost: wsPos.size * wsPos.price,
                                        value: wsPos.size * wsPos.price,
                                        returnAmt: 0,
                                        returnPct: 0
                                    });
                                }
                            }
                            return newPos;
                        });
                        loadData();
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

    // ── Live price from Binance WebSocket (Fastest, ~50ms lag) ──────
    useEffect(() => {
        let prev = 0;
        let ws: WebSocket | null = null;
        let timeoutId: any;

        const connectWs = () => {
            ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');
            
            ws.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    const p = parseFloat(data.p);
                    if (p > 0) {
                        if (prev > 0 && p !== prev) {
                            setPriceFlash(p > prev ? 'up' : 'down');
                            clearTimeout(timeoutId);
                            timeoutId = setTimeout(() => setPriceFlash(null), 600);
                        }
                        prev = p;
                        setLivePrice(p);
                        // Guarantee PTB is never 0 so odds always fluctuate
                        setPriceToBeat(ptb => ptb === 0 ? p : ptb); 
                    }
                } catch (err) {
                    console.warn('Binance WS parse error', err);
                }
            };

            ws.onerror = (e) => console.warn('Binance WS error', e);
            ws.onclose = () => {
                console.warn('Binance WS closed, reconnecting in 3s...');
                setTimeout(connectWs, 3000);
            };
        };

        connectWs();

        return () => {
            if (ws) {
                ws.onclose = null; // prevent reconnect on unmount
                ws.close();
            }
            clearTimeout(timeoutId);
        };
    }, []);

    // ── Live odds from Polymarket CLOB (HTTP Polling) ──────
    useEffect(() => {
        let activeBtcMarket: any = null;
        let intervalId: any;

        const fetchPoly = async () => {
            try {
                const now = Date.now();
                const windowStartSeconds = Math.floor(now / 300000) * 300;
                const slug = routeSlug || `btc-updown-5m-${windowStartSeconds}`;
                
                // Invalidate cache if the slug has changed
                if (activeBtcMarket && activeBtcMarket.slug !== slug) {
                    activeBtcMarket = null;
                }

                if (!activeBtcMarket) {
                    try {
                        const r = await api.predictions.getMarket();
                        if (r && r.market) {
                            activeBtcMarket = {
                                yesTokenId: r.market.yesTokenId,
                                noTokenId: r.market.noTokenId,
                                endDate: new Date(r.market.endsAt).getTime(),
                                slug: r.market.slug || slug
                            };
                            if (isHistorical) {
                                setLiveEndMs(activeBtcMarket.endDate);
                            }
                        }
                    } catch (e) {
                        console.warn("Failed to fetch market from backend API", e);
                    }
                }

                // If we have an active market, poll the order book via HTTP
                if (activeBtcMarket) {
                    const [resY, resN] = await Promise.all([
                        window.fetch(`https://clob.polymarket.com/book?token_id=${activeBtcMarket.yesTokenId}`),
                        window.fetch(`https://clob.polymarket.com/book?token_id=${activeBtcMarket.noTokenId}`)
                    ]);
                    
                    const bookY = await resY.json();
                    const bookN = await resN.json();

                    if (bookY && bookN) {
                        let bestBidY = bookY.bids?.length ? Math.max(...bookY.bids.map((b: any) => parseFloat(b.price))) : null;
                        let bestAskY = bookY.asks?.length ? Math.min(...bookY.asks.map((a: any) => parseFloat(a.price))) : null;
                        let bestBidN = bookN.bids?.length ? Math.max(...bookN.bids.map((b: any) => parseFloat(b.price))) : null;
                        let bestAskN = bookN.asks?.length ? Math.min(...bookN.asks.map((a: any) => parseFloat(a.price))) : null;

                        if (bestAskY === null && bestAskN !== null) bestAskY = 1 - bestAskN;
                        if (bestAskN === null && bestAskY !== null) bestAskN = 1 - bestAskY;
                        if (bestBidY === null && bestBidN !== null) bestBidY = 1 - bestBidN;
                        if (bestBidN === null && bestBidY !== null) bestBidN = 1 - bestBidY;

                        setYesPrice(prev => ({ 
                            buyPrice: bestAskY !== null ? bestAskY : prev.buyPrice, 
                            sellPrice: bestBidY !== null ? bestBidY : prev.sellPrice 
                        }));
                        setNoPrice(prev => ({ 
                            buyPrice: bestAskN !== null ? bestAskN : prev.buyPrice, 
                            sellPrice: bestBidN !== null ? bestBidN : prev.sellPrice 
                        }));
                    }
                }
            } catch (e) {
                console.warn('Frontend Polymarket fetch failed:', e);
            }
        };
        fetchPoly();
        // Poll every 1 second for highly responsive odds
        intervalId = setInterval(fetchPoly, 1000);
        
        return () => {
            clearInterval(intervalId);
        };
    }, []);

    // ── Static Strike Price (Price to Beat) ──────────────
    // Extracted strictly from Polymarket Gamma API above to ensure perfect parity.
    useEffect(() => {
        // Fallback only if Polymarket API hasn't loaded a valid strike
        if (priceToBeat === 0 && history && history.length > 0) {
            setPriceToBeat(history[history.length - 1].open);
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
                    fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&startTime=${targetMs}&limit=1`)
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
            const diff = nextTime - now.getTime();
            
            // If the 5-minute round has rolled over
            if (lastNextTime !== 0 && nextTime > lastNextTime) {
                setTimeout(async () => {
                    await loadData(); // Wait 1s for backend to settle the round before fetching
                    // Shift their historical view if they are viewing a past round, otherwise stay on live
                    setSelectedRound(prev => prev >= 1 ? prev + 1 : prev);
                }, 1000); 
            }
            lastNextTime = nextTime;
            setLiveEndMs(nextTime);

            setTimeLeft({
                mins: Math.floor(diff / 60000).toString().padStart(2, '0'),
                secs: Math.floor((diff % 60000) / 1000).toString().padStart(2, '0'),
            });
            
            const start = new Date(next.getTime() - 300000);
            const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '');
            
            const startTimeStr = formatTime(start);
            const endTimeStr = formatTime(next);
            
            setRoundLabel(`${now.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${startTimeStr}-${endTimeStr}`);
            setLiveEndMs(next.getTime());
        };
        tick();
        const iv = setInterval(tick, 1000);
        return () => clearInterval(iv);
    }, [loadData]);

    // ── Poll balance every 6s ────────────────────────────────────────
    useEffect(() => {
        const poll = async () => {
            try {
                const b = await api.predictions.getBalance();
                if (b && b.balance) setCashBalance(b.balance);
            } catch {}
        };
        const iv = setInterval(poll, 6000);
        return () => clearInterval(iv);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // TradingView has been removed in favor of native SVG PredictChart

    // ── Computed ────────────────────────────────────────────────────────────
    const displayPtb  = selectedRound === -1 ? priceToBeat : selectedRound === -99 ? 0 : (history[selectedRound]?.open || 0);
    const priceDelta  = livePrice > 0 && displayPtb > 0 ? livePrice - displayPtb : 0;
    const isUp        = priceDelta >= 0;
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
        
        if (tradeType === 'buy') {
            if (parseFloat(betAmount) > parseFloat(cashBalance)) { showToast('Insufficient cash balance', 'warning'); return; }
        } else {
            const availableShares = positions.find(p => p.outcome === betType)?.qty || 0;
            if (parseFloat(betAmount) > availableShares) { showToast('Insufficient shares to sell', 'warning'); return; }
        }
        
        setPlacingBet(true);
        try {
            const price = betType === 'UP' ? yesPrice.buyPrice : noPrice.buyPrice;
            const res = await api.predictions.placeBet(
                parseFloat(betAmount), betType,
                price,
                tradeType.toUpperCase() as 'BUY'|'SELL'
            );
            if (res.success) { 
                showToast('Prediction placed!', 'success');

                // Optimistically update cash balance to prevent portfolio dipping
                if (tradeType === 'buy') {
                    setCashBalance(prev => (parseFloat(prev || '0') - parseFloat(betAmount)).toFixed(2));
                } else {
                    const receivedUsdc = parseFloat(betAmount) * price;
                    setCashBalance(prev => (parseFloat(prev || '0') + receivedUsdc).toFixed(2));
                }

                setBetAmount(''); 
                
                // Delay backend fetch to allow relayer to settle funds
                setTimeout(loadData, 3000);
            }
            else showToast('Failed to place prediction', 'error');
        } catch (e: any) { showToast(e.message || 'Order failed', 'error'); }
        finally { setPlacingBet(false); }
    };

    const handleOpenDeposit = async () => {
        haptic('selection'); setDepositModalMode('deposit'); setShowDepositModal(true);
        if (!depositAddress) {
            setDepositWalletLoading(true);
            try { const r = await api.predictions.getDepositWallet(); setDepositAddress(r.address); }
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

    return (
        <div className="pm-page">

            {/* ══ TOP BAR ══════════════════════════════════════════════════ */}
            <header className="pm-topbar">
                <div className="pm-topbar-metrics">
                    <div className="pm-metric">
                        <span className="pm-metric-label">PORTFOLIO</span>
                        <span className="pm-metric-value pm-green">${(parseFloat(cashBalance || '0') + positions.reduce((acc, pos) => acc + (pos.qty * (pos.outcome === 'UP' ? yesPrice.buyPrice : noPrice.buyPrice)), 0)).toFixed(2)}</span>
                    </div>
                    <div className="pm-metric">
                        <span className="pm-metric-label">CASH</span>
                        <span className="pm-metric-value pm-green">${parseFloat(cashBalance).toFixed(2)}</span>
                    </div>
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
                            <span className={isUp ? 'pm-green' : 'pm-red'} style={{textTransform: 'none', fontWeight: 500, fontSize: '11px'}}>Current Price</span>
                            {displayPtb > 0 && (
                                <span className={isUp ? 'pm-green' : 'pm-red'} style={{fontSize: '11px', fontWeight: 600}}>
                                    {isUp ? '▲' : '▼'} ${deltaAbs.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:2})}
                                </span>
                            )}
                        </div>
                        <div className="pm-price-current-row">
                            <span className={`pm-price-val ${isUp ? 'pm-green' : 'pm-red'}`} style={{fontSize: '20px'}}>
                                ${livePrice.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
                            </span>
                        </div>
                    </div>
                    <div className="pm-timer-block">
                        {selectedRound === -1 ? (
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
                        ) : (
                            <button className="pm-go-live-btn" onClick={() => { haptic('selection'); navigate('/predict'); setSelectedRound(-1); }}>
                                <span className="pm-live-dot"/> Go to live market &gt;
                            </button>
                        )}
                    </div>
                </div>

                {/* Chart */}
                <div className="pm-chart-wrap">

                    <div className="pm-chart" style={{ flex: 1, position: 'relative' }}>
                        <PredictChart 
                            livePrice={livePrice} 
                            priceToBeat={displayPtb} 
                            startTimeMs={liveEndMs ? liveEndMs - 300000 : 0} 
                            endTimeMs={liveEndMs || 0} 
                        />
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
                            return (
                                <button key={`past-${offset}`} id={`round-${historyIndex}`}
                                    className={`pm-tl-pill ${selectedRound === historyIndex ? 'pm-tl-pill-active' : ''}`}
                                    onClick={() => { haptic('selection'); setSelectedRound(historyIndex); }}>
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
                />

            </div>

            {/* ══ HISTORY CARD ════════════════════════════════════════════ */}
            <div className="pm-history-card">
                <div className="pm-history-header">
                    <span className="pm-history-title">History</span>
                </div>
                {recentTrades.length === 0 ? (
                    <div className="pm-history-empty">No trades yet this round</div>
                ) : (
                    recentTrades.map((t, idx) => (
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
                    balances={{ usdt: cashBalance, address: depositAddress }}
                    loadBalances={async () => {
                        setDepositWalletLoading(true);
                        try {
                            const b = await api.predictions.getBalance();
                            if (b && b.balance) setCashBalance(b.balance);
                            const r = await api.predictions.getDepositWallet();
                            if (r && r.address) setDepositAddress(r.address);
                        } catch(e) {}
                        setDepositWalletLoading(false);
                    }}
                    copyAddress={() => { 
                        if (depositAddress) { 
                            navigator.clipboard.writeText(depositAddress); 
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
