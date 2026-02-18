import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import './MyAds.css';

interface Props {
    user: any;
}

export function MyAds({ user }: Props) {
    const navigate = useNavigate();
    const [tab, setTab] = useState<'active' | 'history'>('active');
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState<string | null>(null);

    useEffect(() => {
        loadOrders();
    }, []);

    async function loadOrders() {
        setLoading(true);
        try {
            const { orders: data } = await api.orders.mine();
            setOrders(data || []);
        } catch {
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }

    async function handleCancel(orderId: string) {
        if (!confirm('Cancel this ad?')) return;
        setCancelling(orderId);
        try {
            await api.orders.cancel(orderId);
            haptic('success');
            loadOrders();
        } catch (err: any) {
            haptic('error');
            alert('Failed: ' + (err.message || 'Unknown'));
        } finally {
            setCancelling(null);
        }
    }

    const activeOrders = orders.filter(o => o.status === 'active');
    const historyOrders = orders.filter(o => o.status !== 'active');
    const displayOrders = tab === 'active' ? activeOrders : historyOrders;

    return (
        <div className="page ads-page animate-in">
            <div className="ads-header">
                <h1 className="ads-title">My Ads</h1>
            </div>

            {/* Tabs */}
            <div className="ads-tabs">
                <button
                    className={`ads-tab ${tab === 'active' ? 'active' : ''}`}
                    onClick={() => { haptic('selection'); setTab('active'); }}
                >
                    Active ({activeOrders.length})
                </button>
                <button
                    className={`ads-tab ${tab === 'history' ? 'active' : ''}`}
                    onClick={() => { haptic('selection'); setTab('history'); }}
                >
                    History
                </button>
            </div>

            {/* Ads List */}
            <div className="ads-list">
                {loading ? (
                    <div className="ads-skeletons">
                        {[1, 2].map(i => (
                            <div key={i} className="skeleton" style={{ height: 90, borderRadius: 10, marginBottom: 8 }} />
                        ))}
                    </div>
                ) : displayOrders.length > 0 ? (
                    displayOrders.map(order => {
                        const available = order.amount - (order.filled_amount || 0);
                        const isBuy = order.type === 'buy';

                        return (
                            <div key={order.id} className="ads-card">
                                <div className="ads-card-top">
                                    <span className={`ads-type ${isBuy ? 'buy' : 'sell'}`}>
                                        {isBuy ? 'BUY' : 'SELL'}
                                    </span>
                                    <span className="ads-token">{order.token}</span>
                                    <span className={`ads-status status-${order.status}`}>
                                        {order.status.toUpperCase()}
                                    </span>
                                </div>
                                <div className="ads-card-body">
                                    <div className="ads-price-row">
                                        <span className="ads-rate">₹{order.rate.toLocaleString()}</span>
                                        <span className="ads-per">/{order.token}</span>
                                    </div>
                                    <div className="ads-detail-row">
                                        <span className="ads-detail-label">Available</span>
                                        <span className="ads-detail-value">{available.toFixed(2)} {order.token}</span>
                                    </div>
                                    <div className="ads-detail-row">
                                        <span className="ads-detail-label">Methods</span>
                                        <div className="ads-methods">
                                            {(order.payment_methods || []).map((m: string) => (
                                                <span key={m} className="ads-method-chip">{m}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                {tab === 'active' && (
                                    <div className="ads-card-actions">
                                        <button
                                            className="ads-cancel-btn"
                                            onClick={() => handleCancel(order.id)}
                                            disabled={cancelling === order.id}
                                        >
                                            {cancelling === order.id ? 'Cancelling...' : 'Cancel Ad'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <div className="ads-empty">
                        <div className="ads-empty-icon">{tab === 'active' ? '📢' : '📋'}</div>
                        <h3>{tab === 'active' ? 'No active ads' : 'No ad history'}</h3>
                        <p>{tab === 'active' ? 'Create an ad to start trading' : 'Your past ads will appear here'}</p>
                    </div>
                )}
            </div>

            {/* FAB - Create New Ad */}
            <button className="ads-fab" onClick={() => { haptic('medium'); navigate('/create'); }}>
                <span>+</span>
            </button>
        </div>
    );
}
