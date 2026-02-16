import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { TradeCard } from '../components/TradeCard';
import { IconSell, IconBuy, IconSend, IconBridge, IconEmpty } from '../components/Icons';
import './Home.css';

interface Props {
    user: any;
}

export function Home({ user }: Props) {
    const navigate = useNavigate();
    const [balances, setBalances] = useState<any>(null);
    const [trades, setTrades] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        async function load() {
            try {
                const [balData, tradeData, statsData] = await Promise.allSettled([
                    api.wallet.getBalances(),
                    api.trades.list(),
                    api.stats.get(),
                ]);
                if (balData.status === 'fulfilled') setBalances(balData.value);
                if (tradeData.status === 'fulfilled') setTrades((tradeData.value as any).trades || []);
                if (statsData.status === 'fulfilled') setStats(statsData.value);
            } catch { } finally {
                setLoading(false);
            }
        }
        load();
    }, [user?.wallet_address]);

    const activeTrades = trades.filter(t => !['completed', 'cancelled', 'expired', 'refunded'].includes(t.status));

    return (
        <div className="page animate-in">
            {/* Balance Hero */}
            <div className="home-hero card-glass glow-green">
                <div className="hh-label label">Total Balance</div>
                <div className="hh-balance font-mono">
                    {loading ? (
                        <div className="skeleton" style={{ width: 120, height: 32 }} />
                    ) : (
                        <>
                            <span className="hh-amount">{balances?.usdc || '0.00'}</span>
                            <span className="hh-token">USDC</span>
                        </>
                    )}
                </div>
                {balances?.address && (
                    <div className="hh-address text-xs text-muted font-mono truncate" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                        onClick={() => {
                            navigator.clipboard.writeText(balances.address);
                            haptic('success');
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                        }}
                    >
                        {balances.address.slice(0, 10)}...{balances.address.slice(-6)}
                        <span style={{ fontSize: 10, color: copied ? 'var(--green)' : 'var(--text-muted)' }}>
                            {copied ? '✓ Copied' : '📋'}
                        </span>
                    </div>
                )}
                <div className="hh-secondary">
                    {!loading && balances && (
                        <>
                            <span className="text-xs text-muted">
                                ETH: {parseFloat(balances.eth || '0').toFixed(5)}
                            </span>
                            <span className="text-xs text-muted">•</span>
                            <span className="text-xs text-muted">
                                USDT: {balances.usdt || '0.00'}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Quick Actions */}
            <div className="home-actions">
                <button className="ha-btn" onClick={() => { haptic('medium'); navigate('/create'); }}>
                    <span className="ha-icon"><IconSell size={28} /></span>
                    <span>Sell</span>
                </button>
                <button className="ha-btn" onClick={() => { haptic('medium'); navigate('/market'); }}>
                    <span className="ha-icon"><IconBuy size={28} /></span>
                    <span>Buy</span>
                </button>
                <button className="ha-btn" onClick={() => { haptic('medium'); navigate('/wallet'); }}>
                    <span className="ha-icon"><IconSend size={28} /></span>
                    <span>Send</span>
                </button>
                <button className="ha-btn" onClick={() => { haptic('medium'); navigate('/bridge'); }}>
                    <span className="ha-icon"><IconBridge size={28} /></span>
                    <span>Bridge</span>
                </button>
            </div>

            {/* Platform Stats */}
            {stats && (
                <div className="home-stats">
                    <div className="hs-item">
                        <span className="hs-value font-mono">{stats.total_users?.toLocaleString() || 0}</span>
                        <span className="label">Users</span>
                    </div>
                    <div className="hs-item">
                        <span className="hs-value font-mono">${stats.total_volume_usdc?.toLocaleString() || 0}</span>
                        <span className="label">Volume</span>
                    </div>
                    <div className="hs-item">
                        <span className="hs-value font-mono">{stats.active_orders || 0}</span>
                        <span className="label">Live Ads</span>
                    </div>
                </div>
            )}

            {/* Active Trades */}
            <div className="home-section">
                <div className="flex items-center justify-between mb-3">
                    <h3>Active Trades</h3>
                    {activeTrades.length > 0 && (
                        <span className="badge badge-green">{activeTrades.length}</span>
                    )}
                </div>

                {loading ? (
                    <div className="flex flex-col gap-2">
                        <div className="skeleton" style={{ height: 80 }} />
                        <div className="skeleton" style={{ height: 80 }} />
                    </div>
                ) : activeTrades.length > 0 ? (
                    <div className="flex flex-col gap-2">
                        {activeTrades.slice(0, 3).map(trade => (
                            <TradeCard
                                key={trade.id}
                                trade={trade}
                                onTap={() => navigate(`/trade/${trade.id}`)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="icon"><IconEmpty size={48} color="var(--text-muted)" /></div>
                        <h3>No active trades</h3>
                        <p className="text-sm">Browse the market to start trading</p>
                    </div>
                )}
            </div>

            {/* Welcome / Onboarding Banner */}
            <div className="home-welcome card">
                <div className="hw-content">
                    <h3>Welcome, {user?.first_name || 'Trader'} 👋</h3>
                    <p className="text-sm text-secondary">
                        {(user?.upi_id || user?.phone_number || user?.bank_account_number)
                            ? `Trust: ${user.trust_score}% • ${user.completed_trades || 0} trades`
                            : '⚡ Set up your payment methods to start trading →'}
                    </p>
                </div>
                {!(user?.upi_id || user?.phone_number || user?.bank_account_number) && (
                    <button
                        className="btn btn-sm btn-primary"
                        onClick={() => navigate('/profile')}
                    >
                        Setup
                    </button>
                )}
            </div>
        </div>

    );
}
