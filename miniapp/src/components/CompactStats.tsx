import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { isTelegramEnvironment } from '../lib/telegram';
import { IconHistory, IconStar, IconMarket } from './Icons';
import './CompactStats.css';

interface Props {
    userId: string;
}

// Demo stats for local dev — each trader index gets slightly varied numbers
function getMockStats(userId: string) {
    const seed = userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const trades  = 30 + (seed % 400);
    const rate    = 88 + (seed % 12);
    const volume  = 5000 + (seed % 95000);
    return { completed_trades: trades, completion_rate: rate, total_volume: volume };
}

export function CompactStats({ userId }: Props) {
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (userId) loadProfile();
    }, [userId]);

    async function loadProfile() {
        // ── DEV MODE: instant mock stats ──────────────────────────────
        if (!isTelegramEnvironment()) {
            setProfile(getMockStats(userId));
            setLoading(false);
            return;
        }
        // ── PRODUCTION ────────────────────────────────────────────────
        try {
            const data = await api.users.getProfile(userId);
            setProfile(data);
        } catch (err) {
            console.error('CompactStats error:', err);
        } finally {
            setLoading(false);
        }
    }

    if (loading) return <span className="cs-loading">...</span>;
    if (!profile) return null;

    return (
        <div className="cs-container animate-in">
            <div className="cs-chip">
                <IconHistory size={12} color="#848e9c" />
                <span className="cs-value">{profile.completed_trades}</span>
                <span className="cs-label">Trades</span>
            </div>
            <div className="cs-chip">
                <IconStar size={12} color="#22c55e" />
                <span className="cs-value text-green">{profile.completion_rate}%</span>
                <span className="cs-label">Rate</span>
            </div>
            <div className="cs-chip">
                <IconMarket size={12} color="#848e9c" />
                <span className="cs-value">${(profile.total_volume / 1000).toFixed(1)}k</span>
                <span className="cs-label">Vol</span>
            </div>
        </div>
    );
}
