import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { haptic } from '../lib/telegram';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import './PredictCopyTrading.css';

export function PredictCopyTrading() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [period, setPeriod] = useState<'24h' | '7d' | '30d' | 'all'>('all');
    const [metric, setMetric] = useState<'pnl' | 'vol'>('pnl');

    const [copyTraders, setCopyTraders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isLead, setIsLead] = useState(false);
    const [copyingConfig, setCopyingConfig] = useState<any | null>(null);

    // Modal / Drawer state for starting a copy trade
    const [selectedTrader, setSelectedTrader] = useState<any | null>(null);
    const [amountType, setAmountType] = useState<'FIXED' | 'PROPORTIONAL'>('FIXED');
    const [amountValue, setAmountValue] = useState('5');
    const [saving, setSaving] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const [tradersRes, statusRes] = await Promise.all([
                api.predictions.getCopyTraders(),
                api.predictions.getCopyStatus()
            ]);

            if (tradersRes && tradersRes.traders) {
                setCopyTraders(tradersRes.traders);
            }
            if (statusRes) {
                setIsLead(statusRes.allowCopyTrading);
                setCopyingConfig(statusRes.copying);
            }
        } catch (e: any) {
            console.error("[CopyTrading] Failed to load copy trading data:", e);
            showToast("Failed to fetch copy trading details", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleToggleLead = async () => {
        haptic('medium');
        const nextVal = !isLead;
        try {
            const res = await api.predictions.toggleLead(nextVal);
            if (res.success) {
                setIsLead(nextVal);
                showToast(nextVal ? "You are now a Lead Trader!" : "Lead Trader mode disabled", "success");
                loadData();
            }
        } catch (e: any) {
            showToast(e.message || "Failed to update lead status", "error");
        }
    };

    const handleStartCopying = async () => {
        haptic('medium');
        if (!selectedTrader) return;
        const val = parseFloat(amountValue);
        if (isNaN(val) || val <= 0) {
            showToast("Please enter a valid positive number", "warning");
            return;
        }
        if (amountType === 'FIXED' && val < 1) {
            showToast("Minimum fixed copy amount is $1.00", "warning");
            return;
        }

        setSaving(true);
        try {
            const res = await api.predictions.copyTrader(selectedTrader.id, amountType, val);
            if (res.success) {
                showToast(`Started copying @${selectedTrader.username || selectedTrader.name}`, "success");
                setSelectedTrader(null);
                loadData();
            }
        } catch (e: any) {
            showToast(e.message || "Failed to start copy trade", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleStopCopying = async (traderId: string, name: string) => {
        haptic('medium');
        if (!window.confirm(`Are you sure you want to stop copying @${name}?`)) return;

        try {
            const res = await api.predictions.stopCopying(traderId);
            if (res.success) {
                showToast(`Stopped copying @${name}`, "success");
                loadData();
            }
        } catch (e: any) {
            showToast(e.message || "Failed to stop copying", "error");
        }
    };

    return (
        <div className="pm-ct-page">
            {/* Header */}
            <div className="pm-ct-header">
                <button className="pm-ct-back" onClick={() => { haptic('light'); navigate(-1); }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Copy Trading</span>
            </div>

            {/* Lead Status Banner */}
            <div className="pm-ct-lead-banner">
                <div className="pm-ct-lead-banner-left">
                    <span className="pm-ct-lead-banner-title">Become a Lead Trader</span>
                    <span className="pm-ct-lead-banner-desc">Allow other users to copy your prediction wagers</span>
                </div>
                <label className="pm-ct-switch">
                    <input type="checkbox" checked={isLead} onChange={handleToggleLead} />
                    <span className="pm-ct-slider"></span>
                </label>
            </div>

            {/* Currently Copying Info */}
            {copyingConfig && (
                <div className="pm-ct-active-copy-banner">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <span className="pm-ct-active-lbl">⚡ CURRENTLY COPYING</span>
                            <div className="pm-ct-active-val">
                                {copyingConfig.amountType === 'FIXED' ? `$${copyingConfig.amountValue.toFixed(2)} USDC` : `${copyingConfig.amountValue}x Multiplier`} per trade
                            </div>
                        </div>
                        <button 
                            className="pm-ct-stop-top-btn"
                            onClick={() => handleStopCopying(copyingConfig.leadUserId, "Lead Trader")}
                        >
                            Stop Copying
                        </button>
                    </div>
                </div>
            )}

            {/* Filter Section */}
            <div className="pm-ct-filters-row">
                <div className="pm-ct-toggle-group">
                    <button className={period === 'all' ? 'active' : ''} onClick={() => setPeriod('all')}>All time</button>
                    <button className={period === '30d' ? 'active' : ''} onClick={() => setPeriod('30d')}>30d</button>
                </div>
                <div className="pm-ct-toggle-group">
                    <button className={metric === 'pnl' ? 'active' : ''} onClick={() => setMetric('pnl')}>PnL</button>
                    <button className={metric === 'vol' ? 'active' : ''} onClick={() => setMetric('vol')}>Volume</button>
                </div>
            </div>

            {/* Grid */}
            <div className="pm-ct-grid">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px 0' }}>
                        <div className="spinner" style={{ margin: '0 auto 12px' }} />
                        <span style={{ fontSize: 13, color: '#848e9c' }}>Loading lead traders...</span>
                    </div>
                ) : copyTraders.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', background: '#14171d', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
                        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No Lead Traders Active</div>
                        <div style={{ color: '#848e9c', fontSize: 12 }}>Toggle lead mode above to become the first copy trade master!</div>
                    </div>
                ) : copyTraders.map((t) => (
                    <div className="pm-ct-card" key={t.id} style={{ opacity: t.isMe ? 0.75 : 1 }}>
                        <div className="pm-ct-card-top">
                            <div className="pm-ct-user">
                                <div className="pm-ct-avatar">{t.username ? t.username.slice(0, 2).toUpperCase() : t.name.slice(0, 2).toUpperCase()}</div>
                                <div>
                                    <div className="pm-ct-name">
                                        {t.name} {t.isMe && <span className="pm-ct-me-tag">You</span>}
                                    </div>
                                    <div className="pm-ct-handle">@{t.username || 'user'}</div>
                                </div>
                            </div>
                            <div className="pm-ct-badge-row">
                                <span className="pm-ct-copiers-pill">👥 {t.copiersCount} copiers</span>
                                <div className="pm-ct-rank">#{t.rank}</div>
                            </div>
                        </div>

                        <div className="pm-ct-card-mid">
                            <div className="pm-ct-stats">
                                <div className="pm-ct-label">REALIZED PNL</div>
                                <div className="pm-ct-big-pnl" style={{ color: parseFloat(t.pnl.replace('$', '')) >= 0 ? '#0ecb81' : '#f6465d' }}>
                                    {t.pnl}
                                </div>
                                <div className="pm-ct-vol-label">Volume {t.vol}</div>
                            </div>
                            <div className="pm-ct-chart">
                                <svg width="55" height="25" viewBox="0 0 80 40">
                                    <path d="M0 35 L15 30 L30 32 L45 22 L60 25 L75 5 L80 2" fill="none" stroke="#0ecb81" strokeWidth="2.5" strokeLinejoin="round"/>
                                    <path d="M0 35 L15 30 L30 32 L45 22 L60 25 L75 5 L80 2 L80 40 L0 40 Z" fill="url(#greenGrad)" opacity="0.12"/>
                                    <defs>
                                        <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#0ecb81" />
                                            <stop offset="100%" stopColor="transparent" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                            </div>
                        </div>

                        <div className="pm-ct-card-bot">
                            <div className="pm-ct-history" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                <span>Win Rate: <span className="green" style={{ color: '#0ecb81', fontWeight: 700 }}>{t.winRate}</span></span>
                                <span>Ratio: <span style={{ color: '#fff', fontWeight: 600 }}>{t.ratio}</span></span>
                            </div>
                            {!t.isMe && (
                                <div className="pm-ct-actions" style={{ marginTop: 6 }}>
                                    {copyingConfig && copyingConfig.leadUserId === t.id ? (
                                        <button 
                                            className="pm-ct-copy-btn active" 
                                            style={{ backgroundColor: 'rgba(246,70,93,0.15)', color: '#f6465d', border: '1px solid rgba(246,70,93,0.3)' }}
                                            onClick={() => handleStopCopying(t.id, t.name)}
                                        >
                                            Stop Copying
                                        </button>
                                    ) : (
                                        <button 
                                            className="pm-ct-copy-btn" 
                                            onClick={() => { haptic('selection'); setSelectedTrader(t); }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                            Copy Trades
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Copy Settings Drawer Overlay */}
            {selectedTrader && (
                <div className="pm-ct-overlay" onClick={() => setSelectedTrader(null)}>
                    <div className="pm-ct-drawer" onClick={e => e.stopPropagation()}>
                        <div className="pm-ct-drawer-header">
                            <div>
                                <span className="pm-ct-drawer-title">Copy Trading Setup</span>
                                <span className="pm-ct-drawer-sub">Copying @{selectedTrader.username || selectedTrader.name}</span>
                            </div>
                            <button className="pm-ct-drawer-close" onClick={() => setSelectedTrader(null)}>×</button>
                        </div>
                        
                        <div className="pm-ct-drawer-body">
                            {/* Copy Mode Toggle */}
                            <label className="pm-ct-label-row">Copy Amount Type</label>
                            <div className="pm-ct-toggle-tabs">
                                <button 
                                    className={amountType === 'FIXED' ? 'active' : ''} 
                                    onClick={() => { haptic('light'); setAmountType('FIXED'); }}
                                >
                                    Fixed Amount per Trade
                                </button>
                                <button 
                                    className={amountType === 'PROPORTIONAL' ? 'active' : ''} 
                                    onClick={() => { haptic('light'); setAmountType('PROPORTIONAL'); }}
                                >
                                    Proportional Multiplier
                                </button>
                            </div>

                            {/* Value Input */}
                            <label className="pm-ct-label-row">
                                {amountType === 'FIXED' ? 'Amount (USDC.e)' : 'Multiplier Factor'}
                            </label>
                            <div className="pm-ct-input-wrap">
                                <input 
                                    type="number" 
                                    placeholder={amountType === 'FIXED' ? "5.00" : "1.0"} 
                                    value={amountValue}
                                    onChange={e => setAmountValue(e.target.value)} 
                                />
                                <span className="pm-ct-input-unit">
                                    {amountType === 'FIXED' ? 'USDC' : 'x'}
                                </span>
                            </div>

                            {/* Risk Alert */}
                            <div className="pm-ct-risk-card">
                                <span style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>⚠️ Risk Warning</span>
                                Ensure your prediction wallet is funded. Trades automatically copy in the background and will fail if your balance is insufficient.
                            </div>

                            {/* CTA Action */}
                            <button 
                                className="pm-ct-confirm-btn" 
                                disabled={saving} 
                                onClick={handleStartCopying}
                            >
                                {saving ? 'Activating...' : 'Confirm & Start Copying'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
