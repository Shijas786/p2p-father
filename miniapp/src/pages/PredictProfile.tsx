import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { haptic } from '../lib/telegram';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import './PredictProfile.css';

function timeAgo(ms: number) {
    if (!ms) return '';
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

interface Props {
    user: any;
}

export function PredictProfile({ user }: Props) {
    const navigate = useNavigate();
    const { telegramId } = useParams<{ telegramId?: string }>();
    const [profileUser, setProfileUser] = useState<any>(null);
    const [tab, setTab] = useState<'positions' | 'activity'>('positions');
    const [subTab, setSubTab] = useState<'active' | 'closed'>('active');

    const [positions, setPositions] = useState<any[]>([]);
    const [trades, setTrades] = useState<any[]>([]);
    const [claiming, setClaiming] = useState(false);
    const [realizedPnl, setRealizedPnl] = useState(0);
    const { showToast } = useToast();
    
    const handleClaim = async (e: React.MouseEvent, conditionId: string) => {
        e.stopPropagation();
        if (claiming) return;

        haptic('light');
        setClaiming(true);
        showToast("Claiming position...", "info");
        try {
            const res = await api.predictions.autoClaim(conditionId);
            if (res.success && res.claimed > 0) {
                showToast("Claimed successfully!", "success");
                loadData();
            } else {
                showToast("No winning position to claim or already claimed.", "warning");
            }
        } catch (err: any) {
            console.error("[Claim] Error claiming position:", err);
            showToast(err.message || "Failed to claim position.", "error");
        } finally {
            setClaiming(false);
        }
    };
    
    const loadData = useCallback(async () => {
        try {
            const snap = await api.predictions.getSnapshot(telegramId);
            
            if (snap.positions) {
                setPositions(snap.positions);
            }
            if (typeof snap.realizedPnl === 'number') {
                setRealizedPnl(snap.realizedPnl);
            }
            if (snap.trades) {
                // Ensure timestamp is added if missing
                const mappedTrades = snap.trades.map((t: any) => ({
                    ...t,
                    timestamp: t.timestamp || (t.traded_at ? new Date(t.traded_at).getTime() : Date.now())
                }));
                setTrades(mappedTrades);
            }
            if (snap.user) {
                setProfileUser(snap.user);
            } else {
                setProfileUser(user);
            }
        } catch (e) {
            console.error("[Profile] Error loading predictions data:", e);
        }
    }, [telegramId, user]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const [timeframe, setTimeframe] = useState<'1D' | '1W' | '1M' | '1Y' | 'ALL'>('ALL');

    const displayPositions = positions.filter((p: any) => subTab === 'active' ? p.qty > 0 : p.qty <= 0);
    const totalPositionsValue = displayPositions.reduce((acc, pos: any) => acc + (pos.value || 0), 0);
    const unrealizedPnl = positions.reduce((sum, p) => sum + (p.returnAmt || 0), 0);

    // Timeframe filtering
    const now = Date.now();
    let cutoff = 0;
    if (timeframe === '1D') cutoff = now - 24 * 60 * 60 * 1000;
    else if (timeframe === '1W') cutoff = now - 7 * 24 * 60 * 60 * 1000;
    else if (timeframe === '1M') cutoff = now - 30 * 24 * 60 * 60 * 1000;
    else if (timeframe === '1Y') cutoff = now - 365 * 24 * 60 * 60 * 1000;

    const filteredTrades = trades.filter((t: any) => timeframe === 'ALL' || t.timestamp >= cutoff);
    const predictionsCount = filteredTrades.length;

    // Filter resolved trades for cumulative PnL chart
    const resolvedTradesInTimeframe = [...filteredTrades]
        .filter((t: any) => t.resolved)
        .sort((a: any, b: any) => a.timestamp - b.timestamp);

    // Calculate cumulative PnL points
    let cumulative = 0;
    const chartPoints = resolvedTradesInTimeframe.map((t: any) => {
        cumulative += t.pnlUsdc;
        return { x: t.timestamp, y: cumulative };
    });

    const realizedPnlForTimeframe = cumulative;

    // Add starting point
    if (chartPoints.length > 0) {
        chartPoints.unshift({ x: resolvedTradesInTimeframe[0].timestamp - 60000, y: 0 });
    } else {
        const start = cutoff > 0 ? cutoff : now - 3600000;
        chartPoints.push({ x: start, y: 0 });
        chartPoints.push({ x: now, y: 0 });
    }

    const xCoords = chartPoints.map(p => p.x);
    const yCoords = chartPoints.map(p => p.y);
    const minX = Math.min(...xCoords);
    const maxX = Math.max(...xCoords);
    let minY = Math.min(...yCoords);
    let maxY = Math.max(...yCoords);

    if (minY === maxY) {
        minY = minY - 1;
        maxY = maxY + 1;
    } else {
        const diff = maxY - minY;
        minY = minY - diff * 0.1;
        maxY = maxY + diff * 0.1;
    }

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 2;

    const svgWidth = 400;
    const svgHeight = 60;
    const normalizedPoints = chartPoints.map(p => {
        const x = ((p.x - minX) / spanX) * svgWidth;
        const y = svgHeight - (((p.y - minY) / spanY) * (svgHeight - 10) + 5);
        return { x, y };
    });

    let pathD = '';
    let fillD = '';
    if (normalizedPoints.length > 0) {
        pathD = `M ${normalizedPoints[0].x.toFixed(1)} ${normalizedPoints[0].y.toFixed(1)}`;
        for (let i = 1; i < normalizedPoints.length; i++) {
            pathD += ` L ${normalizedPoints[i].x.toFixed(1)} ${normalizedPoints[i].y.toFixed(1)}`;
        }
        fillD = `${pathD} L ${normalizedPoints[normalizedPoints.length - 1].x.toFixed(1)} ${svgHeight} L ${normalizedPoints[0].x.toFixed(1)} ${svgHeight} Z`;
    }

    const pnlTimeframeLabels = {
        '1D': 'Past 24 Hours',
        '1W': 'Past 7 Days',
        '1M': 'Past 30 Days',
        '1Y': 'Past Year',
        'ALL': 'All Time',
    };

    return (
        <div className="pm-prof-page">
            <div className="pm-prof-topbar">
                <button className="pm-prof-back" onClick={() => { haptic('light'); navigate(-1); }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
            </div>

            <div className="pm-prof-dashboard">
                <div className="pm-prof-combined-card">
                    <div className="pm-prof-user-header">
                        <div className="pm-prof-avatar-gradient"></div>
                        <div className="pm-prof-user-info">
                            <h2>{profileUser?.first_name || profileUser?.username || 'Telegram User'}</h2>
                            <p>Joined {new Date(profileUser?.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</p>
                        </div>
                    </div>
                    
                    <div className="pm-prof-stats-row">
                        <div className="pm-prof-stat">
                            <h3>${totalPositionsValue.toFixed(2)}</h3>
                            <p>Positions</p>
                        </div>
                        <div className="pm-prof-stat">
                            <h3 className={realizedPnlForTimeframe >= 0 ? 'green' : 'red'}>
                                {realizedPnlForTimeframe >= 0 ? '+$' : '-$'}{Math.abs(realizedPnlForTimeframe).toFixed(2)}
                            </h3>
                            <p>Realized PNL</p>
                        </div>
                        <div className="pm-prof-stat">
                            <h3>{predictionsCount}</h3>
                            <p>Predictions</p>
                        </div>
                    </div>

                    <div className="pm-prof-divider" />

                    <div className="pm-prof-chart-header">
                        <div className="pm-prof-chart-left">
                            <span className="pm-prof-pnl-label"><span className="pm-prof-pnl-dot"/> Realized Profit/Loss</span>
                            <div className={`pm-prof-pnl-amount ${realizedPnlForTimeframe >= 0 ? 'green' : 'red'}`}>
                                {realizedPnlForTimeframe >= 0 ? '+$' : '-$'}{Math.abs(realizedPnlForTimeframe).toFixed(2)}
                                {realizedPnlForTimeframe >= 0 ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9"/><polyline points="7 16 12 21 17 16"/><line x1="12" y1="21" x2="12" y2="9"/></svg>
                                )}
                            </div>
                            <span className="pm-prof-pnl-time">{pnlTimeframeLabels[timeframe]}</span>
                        </div>
                        <div className="pm-prof-chart-right">
                            <div className="pm-prof-timeframes">
                                {(['1D', '1W', '1M', '1Y', 'ALL'] as const).map(tf => (
                                    <button 
                                        key={tf} 
                                        onClick={() => { haptic('light'); setTimeframe(tf); }} 
                                        className={`pm-prof-tf-btn ${tf === timeframe ? 'active' : ''}`}
                                    >
                                        {tf}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="pm-prof-chart-area">
                        <svg width="100%" height="60" viewBox="0 0 400 60" preserveAspectRatio="none">
                            {pathD && <path d={pathD} fill="none" stroke="#6028ff" strokeWidth="2" />}
                            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6028ff" stopOpacity="0.2" />
                                <stop offset="100%" stopColor="#6028ff" stopOpacity="0" />
                            </linearGradient>
                            {fillD && <path d={fillD} fill="url(#chartGradient)" />}
                        </svg>
                    </div>

                </div>
            </div>

            {/* Bottom Tabs */}
            <div className="pm-prof-main-tabs">
                <button className={`pm-prof-mtab ${tab === 'positions' ? 'active' : ''}`} onClick={() => { haptic('light'); setTab('positions'); }}>Positions</button>
                <button className={`pm-prof-mtab ${tab === 'activity' ? 'active' : ''}`} onClick={() => { haptic('light'); setTab('activity'); }}>Activity</button>
            </div>

            {/* Sub toolbar */}
            <div className="pm-prof-toolbar">
                <div className="pm-prof-sub-tabs">
                    <button className={`pm-prof-stab ${subTab === 'active' ? 'active' : ''}`} onClick={() => { haptic('light'); setSubTab('active'); }}>Active</button>
                    <button className={`pm-prof-stab ${subTab === 'closed' ? 'active' : ''}`} onClick={() => { haptic('light'); setSubTab('closed'); }}>Closed</button>
                </div>
                <div className="pm-prof-search">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input type="text" placeholder="Search positions" />
                </div>
                <button className="pm-prof-sort-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M6 12h12M10 18h4"/></svg>
                    Value
                </button>
            </div>

            {/* Table Header */}
            {tab === 'positions' ? (
                <div className="pm-prof-table-header">
                    <div className="pm-th-market">MARKET <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="7 10 12 15 17 10"/></svg></div>
                    <div className="pm-th-right">
                        <span>AVG <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="7 10 12 15 17 10"/></svg></span>
                        <span>CURRENT</span>
                        <span>VALUE <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="7 10 12 15 17 10"/></svg></span>
                    </div>
                </div>
            ) : (
                <div className="pm-prof-table-header" style={{ display: 'flex', padding: '0 16px', color: '#888', fontSize: '11px', fontWeight: 600, letterSpacing: '0.5px' }}>
                    <div style={{ flex: '0 0 100px' }}>ACTIVITY</div>
                    <div style={{ flex: 1 }}>MARKET</div>
                    <div style={{ flex: '0 0 auto', display: 'flex', gap: '30px' }}>
                        <div style={{ width: '60px', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>VALUE <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="7 10 12 15 17 10"/></svg></div>
                        <div style={{ width: '60px', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>TIME <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="7 10 12 15 17 10"/></svg></div>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="pm-prof-list">
                {tab === 'positions' ? (
                    displayPositions.length === 0 ? (
                        <div className="pm-prof-row" style={{justifyContent: 'center', color: '#888'}}>
                            No positions found.
                        </div>
                    ) : displayPositions.map((pos: any, i: number) => (
                        <div key={pos.id ?? i} className="pm-prof-row">
                            <div className="pm-prof-col-market">
                                <div className="pm-prof-btc-icon">₿</div>
                                <div className="pm-prof-market-info">
                                    <h4>{pos.title || 'Bitcoin Up or Down'}</h4>
                                    <div className="pm-prof-market-bet">
                                        <span className={`pm-prof-bet-pill ${pos.outcome === 'UP' ? 'green' : 'red'}`}>
                                            {pos.outcome === 'UP' ? 'Up' : 'Down'} {(pos.avg * 100).toFixed(1)}<span className="pm-cent">¢</span>
                                        </span>
                                        <span className="pm-prof-bet-shares">{pos.qty.toFixed(1)} shares</span>
                                    </div>
                                </div>
                            </div>
                            <div className="pm-prof-col-right">
                                <span className="pm-prof-cell-avg">{(pos.avg * 100).toFixed(1)}<span className="pm-cent">¢</span></span>
                                <span className="pm-prof-cell-current">{(pos.avg * 100).toFixed(0)}<span className="pm-cent">¢</span></span>
                                <div className="pm-prof-cell-value">
                                    <div className="pm-prof-val-top">${pos.value.toFixed(2)}</div>
                                    <div className={`pm-prof-val-pnl ${pos.returnAmt >= 0 ? 'green' : 'red'}`}>
                                        {pos.returnAmt < 0 ? '-' : '+'}${Math.abs(pos.returnAmt).toFixed(2)} ({pos.returnPct.toFixed(2)}%)
                                    </div>
                                </div>
                                <button className="pm-prof-share-icon">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    trades.length === 0 ? (
                        <div className="pm-prof-row" style={{justifyContent: 'center', color: '#888'}}>
                            No trades found.
                        </div>
                    ) : trades.map((trade: any, i: number) => {
                        const isBuy = String(trade.side).toUpperCase() === 'BUY';
                        const wStart = Math.floor((trade.timestamp || Date.now()) / 300000) * 300000;
                        const wEnd = wStart + 300000;
                        const dateStr = new Date(wStart).toLocaleString([], { month: 'short', day: 'numeric' });
                        const tStart = new Date(wStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                        const tEnd = new Date(wEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                        
                        return (
                            <div key={trade.id ?? i} className="pm-prof-row" style={{ cursor: 'pointer', padding: '16px' }} onClick={() => {
                                haptic('light');
                                navigate(`/predict/btc-updown-5m-${wStart/1000}`);
                            }}>
                                <div className="pm-prof-col-activity" style={{ flex: '0 0 100px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ 
                                        width: 16, height: 16, borderRadius: '50%', backgroundColor: '#2f343d', 
                                        display: 'flex', alignItems: 'center', justifyContent: 'center' 
                                    }}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                    </div>
                                    <span style={{ fontWeight: 600, color: '#fff', fontSize: '14px' }}>{isBuy ? 'Buy' : 'Sell'}</span>
                                </div>
                                
                                <div className="pm-prof-col-market" style={{ flex: 1 }}>
                                    <div className="pm-prof-btc-icon" style={{ flexShrink: 0 }}>₿</div>
                                    <div className="pm-prof-market-info">
                                        <h4 style={{ fontSize: '13px', fontWeight: 500, color: '#e5e7eb', marginBottom: '4px' }}>Bitcoin Up or Down - {dateStr}, {tStart}-{tEnd}</h4>
                                        <div className="pm-prof-market-bet" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span className={`pm-prof-bet-pill ${trade.outcome === 'UP' ? 'green' : 'red'}`} style={{ padding: '2px 6px', fontSize: '11px', borderRadius: '4px' }}>
                                                {trade.outcome === 'UP' ? 'Up' : 'Down'} {(trade.price * 100).toFixed(0)}¢
                                            </span>
                                            <span className="pm-prof-bet-shares" style={{ color: '#888', fontSize: '12px' }}>{trade.qty.toFixed(1)} shares</span>
                                            {trade.resolved && trade.resolution === 'WIN' && !trade.claimed && !telegramId && (
                                                <button 
                                                    className="pm-prof-claim-btn"
                                                    onClick={(e) => handleClaim(e, trade.conditionId)}
                                                    style={{
                                                        padding: '2px 8px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        borderRadius: '4px',
                                                        backgroundColor: '#10b981',
                                                        color: '#fff',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        marginLeft: '6px',
                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                                     }}
                                                >
                                                    {claiming ? 'Claiming...' : 'Claim Win'}
                                                </button>
                                            )}
                                            {trade.resolved && trade.resolution === 'WIN' && trade.claimed && (
                                                <span style={{ fontSize: '11px', color: '#10b981', marginLeft: '6px', fontWeight: 500 }}>
                                                    ✓ Claimed
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="pm-prof-col-right" style={{ flex: '0 0 auto', display: 'flex', gap: '30px', alignItems: 'center', justifyContent: 'flex-end' }}>
                                    <div className="pm-prof-cell-value" style={{ width: '60px', textAlign: 'right', color: isBuy ? '#fff' : '#10b981', fontWeight: 500, fontSize: '14px' }}>
                                        {isBuy ? `-$${trade.cost.toFixed(2)}` : `+$${trade.cost.toFixed(2)}`}
                                    </div>
                                    <div className="pm-prof-cell-time" style={{ color: '#888', fontSize: '12px', width: '60px', textAlign: 'right' }}>
                                        {timeAgo(trade.timestamp)}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    );
}
