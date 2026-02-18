import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import './Orders.css';

interface Props {
    user: any;
}

type TabType = 'ongoing' | 'fulfilled';
type FilterType = 'all' | 'unpaid' | 'paid' | 'appeal';

const STATUS_MAP: Record<FilterType, string[]> = {
    all: [],
    unpaid: ['waiting_for_escrow', 'in_escrow'],
    paid: ['fiat_sent', 'fiat_confirmed'],
    appeal: ['disputed'],
};

const COMPLETED_STATUSES = ['completed', 'cancelled', 'expired', 'refunded'];

export function Orders({ user }: Props) {
    const navigate = useNavigate();
    const [tab, setTab] = useState<TabType>('ongoing');
    const [filter, setFilter] = useState<FilterType>('all');
    const [trades, setTrades] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadTrades();
    }, []);

    async function loadTrades() {
        setLoading(true);
        try {
            const data = await api.trades.list();
            setTrades(data.trades || []);
        } catch {
            setTrades([]);
        } finally {
            setLoading(false);
        }
    }

    const filtered = trades.filter(t => {
        if (tab === 'ongoing') {
            if (COMPLETED_STATUSES.includes(t.status)) return false;
        } else {
            if (!COMPLETED_STATUSES.includes(t.status)) return false;
        }
        if (filter !== 'all' && STATUS_MAP[filter].length > 0) {
            if (!STATUS_MAP[filter].includes(t.status)) return false;
        }
        return true;
    });

    function getStatusLabel(status: string) {
        switch (status) {
            case 'waiting_for_escrow': return 'Waiting for escrow';
            case 'in_escrow': return 'Escrow locked';
            case 'fiat_sent': return 'Payment sent';
            case 'fiat_confirmed': return 'Payment confirmed';
            case 'completed': return 'Completed';
            case 'cancelled': return 'Cancelled';
            case 'expired': return 'Expired';
            case 'refunded': return 'Refunded';
            case 'disputed': return 'In dispute';
            default: return status;
        }
    }

    function getStatusColor(status: string) {
        if (['completed'].includes(status)) return '#0ecb81';
        if (['cancelled', 'expired', 'refunded'].includes(status)) return '#848e9c';
        if (['disputed'].includes(status)) return '#f6465d';
        if (['fiat_sent', 'fiat_confirmed'].includes(status)) return '#f0b90b';
        return '#848e9c';
    }

    return (
        <div className="page orders-page animate-in">
            {/* Header */}
            <div className="orders-header">
                <h1 className="orders-title">Order History</h1>
            </div>

            {/* Tab Header */}
            <div className="orders-tabs">
                <button
                    className={`orders-tab ${tab === 'ongoing' ? 'active' : ''}`}
                    onClick={() => { haptic('selection'); setTab('ongoing'); setFilter('all'); }}
                >
                    Ongoing
                </button>
                <button
                    className={`orders-tab ${tab === 'fulfilled' ? 'active' : ''}`}
                    onClick={() => { haptic('selection'); setTab('fulfilled'); setFilter('all'); }}
                >
                    Fulfilled
                </button>
            </div>

            {/* Sub-filters */}
            {tab === 'ongoing' && (
                <div className="orders-filters">
                    {(['all', 'unpaid', 'paid', 'appeal'] as FilterType[]).map(f => (
                        <button
                            key={f}
                            className={`orders-filter-chip ${filter === f ? 'active' : ''}`}
                            onClick={() => { haptic('selection'); setFilter(f); }}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>
            )}

            {/* Trade List */}
            <div className="orders-list">
                {loading ? (
                    <div className="orders-skeletons">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="skeleton" style={{ height: 80, borderRadius: 8, marginBottom: 8 }} />
                        ))}
                    </div>
                ) : filtered.length > 0 ? (
                    filtered.map(trade => {
                        const isBuyer = trade.buyer_id === user?.id;
                        const counterparty = isBuyer ? trade.seller_username : trade.buyer_username;
                        const totalFiat = trade.amount * trade.rate;

                        return (
                            <div
                                key={trade.id}
                                className="orders-card"
                                onClick={() => { haptic('light'); navigate(`/trade/${trade.id}`); }}
                            >
                                <div className="orders-card-top">
                                    <div className="orders-card-left">
                                        <span className={`orders-type ${isBuyer ? 'buy' : 'sell'}`}>
                                            {isBuyer ? 'Buy' : 'Sell'}
                                        </span>
                                        <span className="orders-counterparty">
                                            {counterparty || 'Anonymous'}
                                        </span>
                                    </div>
                                    <span className="orders-status" style={{ color: getStatusColor(trade.status) }}>
                                        {getStatusLabel(trade.status)}
                                    </span>
                                </div>
                                <div className="orders-card-bottom">
                                    <div className="orders-amount">
                                        <span className="orders-amount-label">Amount</span>
                                        <span className="orders-amount-value">{trade.amount} {trade.token}</span>
                                    </div>
                                    <div className="orders-fiat">
                                        <span className="orders-fiat-label">Total</span>
                                        <span className="orders-fiat-value">₹{totalFiat.toLocaleString()}</span>
                                    </div>
                                    <div className="orders-time">
                                        {new Date(trade.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="orders-empty">
                        <div className="orders-empty-icon">📋</div>
                        <h3>No orders</h3>
                        <p>{tab === 'ongoing' ? 'No active trades right now' : 'Your completed trades will appear here'}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
