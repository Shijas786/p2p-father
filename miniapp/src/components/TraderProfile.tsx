import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { haptic, getTelegramWebApp, isTelegramEnvironment } from '../lib/telegram';
import { IconInstagram, IconSocialX } from './Icons';
import { DEMO_PROFILES } from '../lib/devMocks';
import './TraderProfile.css';

interface Props {
    userId: string;
    onClose: () => void;
    isAdmin?: boolean;
}

export function TraderProfile({ userId, onClose, isAdmin = false }: Props) {
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [togglingBan, setTogglingBan] = useState(false);

    useEffect(() => {
        if (userId) {
            loadProfile();
        }
    }, [userId]);

    async function loadProfile() {
        setLoading(true);
        setError('');
        
        // ─── LOCAL DEV FALLBACK ──────────────────────────────────────────────
        if (!isTelegramEnvironment()) {
            console.log(`[DEV] Dev mode detected, loading mock profile for ${userId}`);
            const mock = DEMO_PROFILES[userId] || DEMO_PROFILES['trader-1'];
            setProfile(mock);
            setLoading(false);
            return;
        }

        try {
            const data = await api.users.getProfile(userId);
            setProfile(data);
        } catch (err: any) {
            console.error('Failed to load trader profile:', err);
            // Fallback if backend isn't ready but we have a mock
            if (DEMO_PROFILES[userId]) {
                setProfile(DEMO_PROFILES[userId]);
            } else {
                setError(err.message || 'Failed to load profile');
            }
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
                            <h2 className="tp-name" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <span>{profile.first_name}</span>
                                {profile.is_banned && (
                                    <span style={{ fontSize: 9, backgroundColor: '#f6465d', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 'bold' }}>
                                        ⛔ BANNED
                                    </span>
                                )}
                            </h2>
                            {profile.username && <p className="tp-handle">@{profile.username}</p>}
                            
                            {/* 📝 Trader Bio */}
                            {profile.bio && (
                                <div className="tp-bio">
                                    {profile.bio}
                                </div>
                            )}

                            <div className="tp-level-badge">LEVEL {profile.level} TRADER</div>

                            {/* 🔗 Social Links (Near Avatar/Header) */}
                            {(profile.instagram_handle || profile.x_handle) && (
                                <div className="tp-socials">
                                    {profile.instagram_handle && (
                                        <button 
                                            className="tp-social-btn inst"
                                            onClick={() => {
                                                haptic('light');
                                                getTelegramWebApp()?.openLink(`https://instagram.com/${profile.instagram_handle}`);
                                            }}
                                            title="Instagram"
                                        >
                                            <IconInstagram size={12} />
                                            <span>@{profile.instagram_handle}</span>
                                        </button>
                                    )}
                                    {profile.x_handle && (
                                        <button 
                                            className="tp-social-btn x"
                                            onClick={() => {
                                                haptic('light');
                                                getTelegramWebApp()?.openLink(`https://x.com/${profile.x_handle}`);
                                            }}
                                            title="X (Twitter)"
                                        >
                                            <IconSocialX size={12} />
                                            <span>@{profile.x_handle}</span>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="tp-stats-mini-grid">
                            <div className="tp-mini-stat">
                                <span className="tp-mini-val">{profile.completed_trades}</span>
                                <span className="tp-mini-lbl">Trades</span>
                            </div>
                            <div className="tp-mini-stat">
                                <span className="tp-mini-val green">{profile.completion_rate}%</span>
                                <span className="tp-mini-lbl">Rate</span>
                            </div>
                            <div className="tp-mini-stat">
                                <span className="tp-mini-val" style={{ color: '#f0b90b' }}>
                                    {profile.avg_completion_minutes ? `~${profile.avg_completion_minutes}m` : '⚡ Fast'}
                                </span>
                                <span className="tp-mini-lbl">Avg Speed</span>
                            </div>
                            <div className="tp-mini-stat wide">
                                <span className="tp-mini-val">${profile.total_volume?.toLocaleString()}</span>
                                <span className="tp-mini-lbl">Total Volume</span>
                            </div>
                        </div>

                        <div className="tp-footer-info">
                            Member since {new Date(profile.member_since).toLocaleDateString()}
                        </div>

                        {isAdmin && (
                            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                <button
                                    style={{
                                        width: '100%',
                                        padding: '10px 16px',
                                        borderRadius: '8px',
                                        fontWeight: 'bold',
                                        fontSize: '12px',
                                        backgroundColor: profile.is_banned ? 'rgba(16, 185, 129, 0.15)' : 'rgba(246, 70, 93, 0.15)',
                                        color: profile.is_banned ? '#10b981' : '#f6465d',
                                        border: profile.is_banned ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(246, 70, 93, 0.4)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 6
                                    }}
                                    disabled={togglingBan}
                                    onClick={async () => {
                                        setTogglingBan(true);
                                        try {
                                            haptic('warning');
                                            const res = await api.admin.toggleBanUser(userId);
                                            setProfile((prev: any) => ({ ...prev, is_banned: res.is_banned }));
                                        } catch (err: any) {
                                            alert('Failed to update ban: ' + (err.message || err));
                                        } finally {
                                            setTogglingBan(false);
                                        }
                                    }}
                                >
                                    {togglingBan ? 'Updating...' : profile.is_banned ? '✅ UNBLOCK TRADER' : '⛔ BLOCK TRADER'}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
