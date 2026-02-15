import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { OrderCard } from '../components/OrderCard';
import { IconSell, IconBuy, IconEmpty, IconPlus, IconRefresh } from '../components/Icons';
import './Market.css';

interface Props {
    user: any;
}

export function Market({ user }: Props) {
    const navigate = useNavigate();
    const [tab, setTab] = useState<'sell' | 'buy'>('sell');
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadOrders();
    }, [tab]);

    async function loadOrders() {
        setLoading(true);
        try {
            const { orders: data } = await api.orders.list(tab);
            setOrders(data || []);
        } catch {
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }

    function handleTap(order: any) {
        haptic('light');
        if (user && order.user_id === user.id) {
            // Own order: show management options? 
            // For now, OrderCard handles the "Cancel" button if we pass isMyOrder
            // But if we tap the card body, maybe nothing happens or we go to detail scan?
            // Let's just navigate to detail for now, or do nothing.
        } else {
            navigate(`/trade/new/${order.id}`);
        }
    }

    return (
        <div className="page animate-in">
            <div className="page-header">
                <h1 className="page-title">Marketplace</h1>
                <p className="page-subtitle">Browse live P2P orders</p>
            </div>

            {/* Tabs */}
            <div className="tabs">
                <button
                    className={`tab ${tab === 'sell' ? 'active' : ''}`}
                    onClick={() => { haptic('selection'); setTab('sell'); }}
                >
                    <IconSell size={16} /> Sell Orders
                </button>
                <button
                    className={`tab ${tab === 'buy' ? 'active' : ''}`}
                    onClick={() => { haptic('selection'); setTab('buy'); }}
                >
                    <IconBuy size={16} /> Buy Orders
                </button>
            </div>

            <div className="market-hint text-xs text-muted mb-3">
                {tab === 'sell'
                    ? 'Sellers offering crypto — tap to buy from them'
                    : 'Buyers looking for crypto — tap to sell to them'}
            </div>

            {/* Orders */}
            <div className="market-orders">
                {loading ? (
                    <div className="flex flex-col gap-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="skeleton" style={{ height: 120 }} />
                        ))}
                    </div>
                ) : orders.length > 0 ? (
                    <div className="flex flex-col gap-2">
                        {orders.map(order => (
                            <OrderCard
                                key={order.id}
                                order={order}
                                onTap={handleTap}
                                isMyOrder={user?.id === order.user_id}
                                onRefresh={loadOrders}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="icon"><IconEmpty size={48} color="var(--text-muted)" /></div>
                        <h3>No {tab} orders</h3>
                        <p className="text-sm">Be the first to create one!</p>
                        <button
                            className="btn btn-primary btn-sm mt-3"
                            onClick={() => navigate('/create')}
                        >
                            <IconPlus size={14} /> Create Ad
                        </button>
                    </div>
                )}
            </div>

            {/* Refresh */}
            <button
                className="btn btn-secondary btn-block mt-3"
                onClick={() => { haptic('light'); loadOrders(); }}
                disabled={loading}
            >
                {loading ? <span className="spinner" /> : <IconRefresh size={16} />} Refresh
            </button>
        </div>
    );
}
