import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { haptic } from '../lib/telegram';
import { api } from '../lib/api';
import './PredictLeaderboard.css';

export function PredictLeaderboard() {
    const navigate = useNavigate();
    const [tab, setTab] = useState<'all-time' | 'season2'>('all-time');
    const [showHandle, setShowHandle] = useState(false);

    const [leaderboard, setLeaderboard] = useState<any[]>([]);

    React.useEffect(() => {
        api.predictions.getLeaderboard().then((res: any) => {
            if (res && res.leaderboard) setLeaderboard(res.leaderboard);
        }).catch((e: any) => console.error(e));
    }, []);

    return (
        <div className="pm-lb-page">
            {/* Header */}
            <div className="pm-lb-header">
                <button className="pm-lb-back" onClick={() => { haptic('light'); navigate(-1); }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <div className="pm-lb-title-group">
                    <h1>Leaderboard</h1>
                    <div className="pm-lb-tabs">
                        <button className={`pm-lb-tab active`} onClick={() => setTab('all-time')}>All-time</button>
                    </div>
                </div>
                <div className="pm-lb-right-controls">
                    <button className="pm-lb-refresh">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    </button>
                </div>
            </div>

            <p className="pm-lb-subtitle">{leaderboard.length} traders ranked by total trading volume</p>

            {/* Search */}
            <div className="pm-lb-search-container">
                <div className="pm-lb-search-box">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input type="text" placeholder="Search leaderboard..." />
                </div>
            </div>

            {/* Table */}
            <div className="pm-lb-table-container">
                <table className="pm-lb-table">
                    <thead>
                        <tr>
                            <th className="th-rank">Rank</th>
                            <th className="th-user">User</th>
                            <th className="th-num">Predictions Vol</th>
                            <th className="th-num">All-time PNL</th>
                            <th className="th-num">W/L (Ratio)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leaderboard.length === 0 ? (
                            <tr><td colSpan={5} style={{textAlign: 'center', padding: '20px', color: '#888'}}>No traders found</td></tr>
                        ) : leaderboard.map((row, i) => (
                            <tr key={row.rank || i} style={{ cursor: 'pointer' }} onClick={() => {
                                if (row._telegram_id) {
                                    haptic('light');
                                    navigate(`/predict-profile/${row._telegram_id}`);
                                }
                            }}>
                                <td className="td-rank">
                                    <span className={`pm-lb-rank-badge rank-${row.rank || i+1}`}>{`#${row.rank || i+1}`}</span>
                                </td>
                                <td className="td-user">
                                    <div className="pm-lb-user" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {row.photo_url ? (
                                            <img 
                                                src={row.photo_url} 
                                                alt={row.user} 
                                                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} 
                                            />
                                        ) : (
                                            <div className="pm-lb-avatar-fallback" style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #1677ff 0%, #722ed1 100%)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                                color: '#fff',
                                                flexShrink: 0
                                            }}>
                                                {String(row.user || 'U').charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <span className="pm-lb-user-name">{row.user}</span>
                                    </div>
                                </td>
                                <td className="td-num">{row.pred || '$0.00'}</td>
                                <td className="td-num bold" style={{ color: row.pnl?.includes('+') ? '#00e676' : row.pnl?.includes('-') ? '#ff1744' : 'inherit' }}>{row.pnl || '$0.00'}</td>
                                <td className="td-num">
                                    <span style={{color: '#00e676'}}>{row.wins || 0}W</span> / <span style={{color: '#ff1744'}}>{row.losses || 0}L</span>
                                    <div style={{fontSize: '10px', color: '#888', marginTop: '2px'}}>{row.winRatio || '0%'}</div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
