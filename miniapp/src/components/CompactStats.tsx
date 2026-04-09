import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './CompactStats.css';

interface Props {
    userId: string;
}

export function CompactStats({ userId }: Props) {
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (userId) loadProfile();
    }, [userId]);

    async function loadProfile() {
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
            <span className="cs-item">{profile.completed_trades} Trades</span>
            <span className="cs-divider">|</span>
            <span className="cs-item text-green">{profile.completion_rate}% Rate</span>
            <span className="cs-divider">|</span>
            <span className="cs-item">${profile.total_volume?.toLocaleString()} Vol</span>
        </div>
    );
}
