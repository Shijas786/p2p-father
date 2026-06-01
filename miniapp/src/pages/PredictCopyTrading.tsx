import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { haptic } from '../lib/telegram';
import { api } from '../lib/api';
import './PredictCopyTrading.css';

export function PredictCopyTrading() {
    const navigate = useNavigate();
    const [period, setPeriod] = useState<'24h' | '7d' | '30d' | 'all'>('24h');
    const [metric, setMetric] = useState<'pnl' | 'vol'>('pnl');

    const [copyTraders, setCopyTraders] = useState<any[]>([]);

    React.useEffect(() => {
        api.predictions.getCopyTraders().then((res: any) => {
            if (res && res.traders) setCopyTraders(res.traders);
        }).catch((e: any) => console.error(e));
    }, []);

    return (
        <div className="pm-ct-page">
            {/* Header */}
            <div className="pm-ct-header">
                <button className="pm-ct-back" onClick={() => { haptic('light'); navigate(-1); }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <div className="pm-ct-filters">
                    <div className="pm-ct-toggle-group">
                        <button className={period === '24h' ? 'active' : ''} onClick={() => setPeriod('24h')}>24h</button>
                        <button className={period === '7d' ? 'active' : ''} onClick={() => setPeriod('7d')}>7d</button>
                        <button className={period === '30d' ? 'active' : ''} onClick={() => setPeriod('30d')}>30d</button>
                        <button className={period === 'all' ? 'active' : ''} onClick={() => setPeriod('all')}>All time</button>
                    </div>
                    <div className="pm-ct-toggle-group">
                        <button className={metric === 'pnl' ? 'active' : ''} onClick={() => setMetric('pnl')}>PnL</button>
                        <button className={metric === 'vol' ? 'active' : ''} onClick={() => setMetric('vol')}>Volume</button>
                    </div>
                    <button className="pm-ct-filter-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                        Filters <span className="badge">3</span>
                    </button>
                    <button className="pm-ct-wallet-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        Copy by wallet
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div className="pm-ct-grid">
                {copyTraders.length === 0 ? (
                    <div style={{gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#888'}}>
                        No traders found.
                    </div>
                ) : copyTraders.map((t) => (
                    <div className="pm-ct-card" key={t.id}>
                        <div className="pm-ct-card-top">
                            <div className="pm-ct-user">
                                <div className="pm-ct-avatar">{t.avatar || 'T'}</div>
                                <div>
                                    <div className="pm-ct-name">{t.name}</div>
                                    {t.handle && <div className="pm-ct-handle">{t.handle}</div>}
                                </div>
                            </div>
                            <div className="pm-ct-rank">#{t.rank}</div>
                        </div>

                        <div className="pm-ct-card-mid">
                            <div className="pm-ct-stats">
                                <div className="pm-ct-label">PNL</div>
                                <div className="pm-ct-big-pnl">{t.pnl || '$0.00'}</div>
                                <div className="pm-ct-vol-label">Vol {t.vol || '$0.00'}</div>
                            </div>
                            <div className="pm-ct-chart">
                                <svg width="50" height="25" viewBox="0 0 80 40">
                                    <path d="M0 20 L20 18 L30 18 L40 30 L45 28 L50 25 L60 25 L75 10 L80 5" fill="none" stroke="#0ecb81" strokeWidth="2" strokeLinejoin="round"/>
                                    <path d="M0 20 L20 18 L30 18 L40 30 L45 28 L50 25 L60 25 L75 10 L80 5 L80 40 L0 40 Z" fill="url(#greenGrad)" opacity="0.1"/>
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
                            <div className="pm-ct-history">
                                <span>All-time <span className="green">{t.allTime || '$0.00'}</span></span>
                                <span>24h <span className="green">{t.daily || '$0.00'}</span></span>
                            </div>
                            <div className="pm-ct-actions">
                                <button className="pm-ct-copy-btn" onClick={() => haptic('medium')}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    Copy trade
                                </button>
                                <button className="pm-ct-share-btn" onClick={() => haptic('light')}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
