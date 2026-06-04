import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { haptic } from '../lib/telegram';
import { api } from '../lib/api';
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
    const [tab, setTab] = useState<'positions' | 'activity'>('positions');
    const [subTab, setSubTab] = useState<'active' | 'closed'>('active');

    const [positions, setPositions] = useState<any[]>([]);
    const [trades, setTrades] = useState<any[]>([]);
    const [claiming, setClaiming] = useState(false);
    const [realizedPnl, setRealizedPnl] = useState(0);
    
    const loadData = () => {
        api.predictions.getPositions(true).then((res: any) => {
            if (res && res.positions) {
                setPositions(res.positions);
            }
            if (typeof res?.realizedPnl === 'number') setRealizedPnl(res.realizedPnl);
        }).catch((e: any) => console.error(e));

        api.predictions.getTrades('?all=true').then((res: any) => {
            if (res && res.trades) setTrades(res.trades);
        }).catch((e: any) => console.error(e));
    };

    useEffect(() => {
        loadData();
    }, []);

    const displayPositions = positions.filter((p: any) => subTab === 'active' ? p.qty > 0 : p.qty <= 0);
    const totalPositionsValue = displayPositions.reduce((acc, pos: any) => acc + (pos.value || 0), 0);
    const predictionsCount = trades.length;
    const unrealizedPnl = positions.reduce((sum, p) => sum + (p.returnAmt || 0), 0);
    const totalPnl = unrealizedPnl + realizedPnl;

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
                            <h2>{user?.first_name || user?.username || 'Telegram User'}</h2>
                            <p>Joined {new Date(user?.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</p>
                        </div>
                    </div>
                    
                    <div className="pm-prof-stats-row">
                        <div className="pm-prof-stat">
                            <h3>${totalPositionsValue.toFixed(2)}</h3>
                            <p>Positions</p>
                        </div>
                        <div className="pm-prof-stat">
                            <h3 className={totalPnl >= 0 ? 'green' : 'red'}>{totalPnl >= 0 ? '+$' : '-$'}{Math.abs(totalPnl).toFixed(2)}</h3>
                            <p>Active PNL</p>
                        </div>
                        <div className="pm-prof-stat">
                            <h3>{predictionsCount}</h3>
                            <p>Predictions</p>
                        </div>
                    </div>

                    <div className="pm-prof-divider" />

                    <div className="pm-prof-chart-header">
                        <div className="pm-prof-chart-left">
                            <span className="pm-prof-pnl-label"><span className="pm-prof-pnl-dot"/> Profit/Loss</span>
                            <div className={`pm-prof-pnl-amount ${totalPnl >= 0 ? 'green' : 'red'}`}>
                                {totalPnl >= 0 ? '+$' : '-$'}{Math.abs(totalPnl).toFixed(2)}
                                {totalPnl >= 0 ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9"/><polyline points="7 16 12 21 17 16"/><line x1="12" y1="21" x2="12" y2="9"/></svg>
                                )}
                            </div>
                            {realizedPnl !== 0 && (
                                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                                    Realized: <span style={{ color: realizedPnl >= 0 ? '#10b981' : '#ef4444' }}>{realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}</span>
                                    {unrealizedPnl !== 0 && <> · Open: <span style={{ color: unrealizedPnl >= 0 ? '#10b981' : '#ef4444' }}>{unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)}</span></>}
                                </div>
                            )}
                            <span className="pm-prof-pnl-time">All Time</span>
                        </div>
                        <div className="pm-prof-chart-right">
                            <div className="pm-prof-timeframes">
                                {['1D', '1W', '1M', '1Y', 'ALL'].map(tf => (
                                    <button key={tf} className={`pm-prof-tf-btn ${tf === '1D' ? 'active' : ''}`}>{tf}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="pm-prof-chart-area">
                        {/* Mock SVG Chart line */}
                        <svg width="100%" height="60" viewBox="0 0 400 80" preserveAspectRatio="none">
                            <path d="M0,50 C20,40 30,30 50,30 C70,30 80,60 100,60 L280,60 C300,60 320,50 340,40 C360,30 380,10 400,0" fill="none" stroke="#6028ff" strokeWidth="2" />
                            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6028ff" stopOpacity="0.2" />
                                <stop offset="100%" stopColor="#6028ff" stopOpacity="0" />
                            </linearGradient>
                            <path d="M0,50 C20,40 30,30 50,30 C70,30 80,60 100,60 L280,60 C300,60 320,50 340,40 C360,30 380,10 400,0 L400,80 L0,80 Z" fill="url(#chartGradient)" />
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
