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
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [hasMore, setHasMore] = useState(false);

    useEffect(() => {
        loadLeaderboard(page);
    }, [page]);

    async function loadLeaderboard(p: number) {
        setLoading(true);
        setError('');
        try {
            const data = await api.getLeaderboard(p);
            setUsers(data.leaderboard);
            setTotalCount(data.total_count);
            setHasMore(data.has_more);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    const totalPages = Math.ceil(totalCount / 50);

    function goNext() {
        if (hasMore) {
            haptic('light');
            setPage(p => p + 1);
        }
    }

    function goPrev() {
        if (page > 1) {
            haptic('light');
            setPage(p => p - 1);
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

            {/* Page Info */}
            {!loading && !error && totalCount > 0 && (
                <div className="lb-page-info">
                    Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, totalCount)} of {totalCount} traders
                </div>
            )}

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

            {/* Pagination */}
            {!loading && !error && totalCount > 50 && (
                <div className="lb-pagination">
                    <button
                        className="lb-page-btn"
                        onClick={goPrev}
                        disabled={page <= 1}
                    >
                        ‹ Prev
                    </button>
                    <span className="lb-page-num">
                        Page {page} / {totalPages}
                    </span>
                    <button
                        className="lb-page-btn"
                        onClick={goNext}
                        disabled={!hasMore}
                    >
                        Next ›
                    </button>
                </div>
            )}
        </div>
    );
}
