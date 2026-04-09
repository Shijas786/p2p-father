import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import './TraderProfile.css';

interface Props {
    userId: string;
    onClose: () => void;
}

export function TraderProfile({ userId, onClose }: Props) {
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (userId) {
            loadProfile();
        }
    }, [userId]);

    async function loadProfile() {
        setLoading(true);
        try {
            const data = await api.users.getProfile(userId);
            setProfile(data);
        } catch (err: any) {
            console.error('Failed to load trader profile:', err);
            setError(err.message || 'Failed to load profile');
        } finally {
            setLoading(false);
        }
    }

    if (!userId) return null;

    return (
        <div className="tp-overlay animate-in" onClick={onClose}>
            <div className="tp-drawer" onClick={(e) => e.stopPropagation()}>
                <button className="tp-close" onClick={() => { haptic('light'); onClose(); }}>✕</button>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="spinner" />
                        <p className="mt-4 text-xs text-muted">Fetching trader data...</p>
                    </div>
                ) : error ? (
                    <div className="text-center py-10">
                        <div className="text-4xl mb-4">⚠️</div>
                        <p className="text-red text-sm">{error}</p>
                    </div>
                ) : (
                    <>
                        <div className="tp-header">
                            <div className="tp-avatar">
                                {profile.photo_url ? (
                                    <img src={profile.photo_url} alt="" />
                                ) : (
                                    <span className="tp-avatar-letter">{profile.first_name?.[0]?.toUpperCase()}</span>
                                )}
                            </div>
                            <h2 className="tp-name">{profile.first_name}</h2>
                            {profile.username && <p className="tp-handle">@{profile.username}</p>}
                            <div className="tp-level-badge">LEVEL {profile.level} TRADER</div>
                        </div>

                        <div className="tp-stats-grid">
                            <div className="tp-stat-card">
                                <span className="tp-stat-val">{profile.completed_trades}</span>
                                <span className="tp-stat-lbl">Trades</span>
                            </div>
                            <div className="tp-stat-card">
                                <span className="tp-stat-val green">{profile.completion_rate}%</span>
                                <span className="tp-stat-lbl">Rate</span>
                            </div>
                            <div className="tp-stat-card">
                                <span className="tp-stat-val">{profile.buy_count}</span>
                                <span className="tp-stat-lbl">Total Buy</span>
                            </div>
                            <div className="tp-stat-card">
                                <span className="tp-stat-val">{profile.sell_count}</span>
                                <span className="tp-stat-lbl">Total Sell</span>
                            </div>
                            <div className="tp-stat-card" style={{ gridColumn: 'span 2' }}>
                                <span className="tp-stat-val">${profile.total_volume?.toLocaleString()}</span>
                                <span className="tp-stat-lbl">Total Volume</span>
                            </div>
                        </div>

                        <div className="tp-footer-info">
                            Member since {new Date(profile.member_since).toLocaleDateString()}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
