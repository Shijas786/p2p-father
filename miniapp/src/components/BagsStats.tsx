import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import './BagsStats.css';

export function BagsStats() {
    const [stats, setStats] = useState<{ price: number; mcap: number; lifetime_fees: number; mint?: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        fetchStats();
        // Refresh every 60 seconds
        const interval = setInterval(fetchStats, 60000);
        return () => clearInterval(interval);
    }, []);

    async function fetchStats() {
        try {
            const data = await api.bags.getStats();
            if (data && !('error' in data)) {
                setStats(data);
                setError(false);
            } else {
                setError(true);
            }
        } catch (err) {
            console.error('[BagsStats] Failed to fetch:', err);
            setError(true);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="bags-stats-card skeleton-loading">
                <div className="skeleton" style={{ width: '40%', height: 20, marginBottom: 12 }} />
                <div className="skeleton" style={{ width: '100%', height: 40 }} />
            </div>
        );
    }

    if (error || !stats) {
        return null; // Don't show if there's an error or no mint configured
    }

    return (
        <div className="bags-stats-card animate-in" onClick={() => haptic('light')}>
            <div className="bags-stats-header">
                <div className="bags-logo">
                    <IconBags size={24} />
                    <span>P2P Kerala ($P2PK)</span>
                </div>
                <div className="bags-badge">LIVE ON BAGS.FM</div>
            </div>

            <div className="bags-stats-grid">
                <div className="bags-stat-item">
                    <span className="bags-stat-label">Price</span>
                    <span className="bags-stat-value">${stats.price.toLocaleString(undefined, { minimumFractionDigits: 6 })}</span>
                </div>
                <div className="bags-stat-item">
                    <span className="bags-stat-label">Market Cap</span>
                    <span className="bags-stat-value">${stats.mcap.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="bags-stat-item">
                    <span className="bags-stat-label">Claimable Fees</span>
                    <span className="bags-stat-value">${stats.lifetime_fees.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
            </div>

            <button 
                className="bags-buy-btn"
                onClick={(e) => {
                    e.stopPropagation();
                    haptic('medium');
                    if (stats.mint) {
                        window.open(`https://bags.fm/${stats.mint}`, '_blank');
                    } else {
                        window.open('https://bags.fm/launch/feed', '_blank');
                    }
                }}
            >
                Trade on Bags.fm 🚀
            </button>
        </div>
    );
}

function IconBags({ size = 24 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 2L3 6V20C3 20.5304 3.21071 21.0391 3.58579 21.4142C3.96086 21.7893 4.46957 22 5 22H19C19.5304 22 20.0391 21.7893 20.4142 21.4142C20.7893 21.0391 21 20.5304 21 20V6L18 2H6Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 6H21" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M16 10C16 11.0609 15.5786 12.0783 14.8284 12.8284C14.0783 13.5786 13.0609 14 12 14C10.9391 14 9.92172 13.5786 9.17157 12.8284C8.42143 12.0783 8 11.0609 8 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}
