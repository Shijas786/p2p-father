import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import './Leaderboard.css';

interface LeaderboardUser {
    rank: number;
    id: string;
    name: string;
    photo_url?: string;
    points: number;
    volume: number;
    trades: number;
    is_me: boolean;
}

export function Leaderboard() {
    const navigate = useNavigate();
    const [users, setUsers] = useState<LeaderboardUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadLeaderboard();
    }, []);

    async function loadLeaderboard() {
        try {
            const data = await api.getLeaderboard();
            setUsers(data.leaderboard);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="page leaderboard-page animate-in">
            {/* Header */}
            <div className="lb-header">
                <button className="lb-back-btn" onClick={() => { haptic('light'); navigate(-1); }}>
                    ← Only on P2PFather
                </button>
                <h1>Leaderboard</h1>
                <p className="lb-subtitle">Top Traders & Rewards</p>
            </div>

            {/* Rewards Info */}
            <div className="lb-rewards-card">
                <div className="lb-rewards-icon">💎</div>
                <div className="lb-rewards-content">
                    <h3>Earn Points. Unlock Rewards.</h3>
                    <p>Accumulate points to qualify for future <b>Foundation Incentives</b>. Consistent volume and new connections are key to maximizing your allocation.</p>
                </div>
            </div>

            {/* List */}
            <div className="lb-list">
                {loading ? (
                    <div className="lb-loading">Loading rankings...</div>
                ) : error ? (
                    <div className="lb-error">Error: {error}</div>
                ) : (
                    users.map((user) => (
                        <div key={user.id} className={`lb-item ${user.is_me ? 'is-me' : ''}`}>
                            <div className="lb-rank">#{user.rank}</div>

                            <div className="lb-avatar">
                                {user.photo_url ? (
                                    <img src={user.photo_url} alt="" />
                                ) : (
                                    <div className="lb-avatar-placeholder">{user.name[0]}</div>
                                )}
                            </div>

                            <div className="lb-info">
                                <div className="lb-name">{user.name} {user.is_me && '(You)'}</div>
                                <div className="lb-stats-row">
                                    <span className="lb-vol">${user.volume.toLocaleString()} Vol</span>
                                    <span className="lb-trades">{user.trades} Trades</span>
                                </div>
                            </div>

                            <div className="lb-points">
                                <span className="lb-points-val">{user.points}</span>
                                <span className="lb-points-label">PTS</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
