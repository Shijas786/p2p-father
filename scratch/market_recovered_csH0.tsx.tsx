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

const PAYMENT_FILTERS = ['All', 'UPI', 'IMPS', 'BANK', 'PAYTM'];

export function Market({ user }: Props) {
    const navigate = useNavigate();
    const [tab, setTab] = useState<'sell' | 'buy'>('sell');
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [feePercentage, setFeePercentage] = useState(0.01);
    const [searchQuery, setSearchQuery] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('All');
    const [confirmOrder, setConfirmOrder] = useState<any>(null);

    useEffect(() => {
        api.stats.get().then(data => {
            if (data.fee_percentage) setFeePercentage(data.fee_percentage);
        }).catch(console.error);
    }, []);

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
        if (user && order.user_id === user.id) return;
        setConfirmOrder(order);
    }

    function confirmTrade() {
        if (!confirmOrder) return;
        haptic('medium');
        setConfirmOrder(null);
        navigate(`/trade/new/${confirmOrder.id}`);
    }

    // Filter and search orders
    const filteredOrders = orders.filter(order => {
        // Payment method filter
        if (paymentFilter !== 'All') {
            if (!(order.payment_methods || []).includes(paymentFilter)) return false;
        }
        // Search by username or amount
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const matchUsername = order.username?.toLowerCase().includes(q);
            const matchAmount = order.amount.toString().includes(q);
            const matchRate = order.rate.toString().includes(q);
            if (!matchUsername && !matchAmount && !matchRate) return false;
        }
        return true;
    });

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

            {/* Search Bar */}
            <div className="market-search">
                <input
                    type="text"
                    placeholder="🔍 Search by user, amount, or rate..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="market-search-input"
                />
            </div>

            {/* Payment Method Filter */}
            <div className="market-filters">
                {PAYMENT_FILTERS.map(f => (
                    <button
                        key={f}
                        className={`market-filter-chip ${paymentFilter === f ? 'active' : ''}`}
                        onClick={() => { haptic('selection'); setPaymentFilter(f); }}
                    >
                        {f === 'UPI' ? '📱' : f === 'IMPS' ? '🏦' : f === 'BANK' ? '🏛️' : f === 'PAYTM' ? '💳' : '📋'} {f}
                    </button>
                ))}
            </div>

            <div className="market-hint text-xs text-muted mb-3">
                {tab === 'sell'
                    ? 'Sellers offering crypto — tap to buy from them'
                    : 'Buyers looking for crypto — tap to sell to them'}
                {filteredOrders.length !== orders.length && (
                    <span className="text-green"> • {filteredOrders.length} of {orders.length} shown</span>
                )}
            </div>

            {/* Orders */}
            <div className="market-orders">
                {loading ? (
                    <div className="flex flex-col gap-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="skeleton" style={{ height: 120 }} />
                        ))}
                    </div>
                ) : filteredOrders.length > 0 ? (
                    <div className="flex flex-col gap-2">
                        {filteredOrders.map(order => (
                            <OrderCard
                                key={order.id}
                                order={order}
                                onTap={handleTap}
                                isMyOrder={user?.id === order.user_id}
                                onRefresh={loadOrders}
                                feePercentage={feePercentage}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="icon"><IconEmpty size={48} color="var(--text-muted)" /></div>
                        <h3>No {tab} orders{paymentFilter !== 'All' ? ` with ${paymentFilter}` : ''}</h3>
                        <p className="text-sm">
                            {searchQuery ? 'Try a different search' : 'Be the first to create one!'}
                        </p>
                        {!searchQuery && (
                            <button
                                className="btn btn-primary btn-sm mt-3"
                                onClick={() => navigate('/create')}
                            >
                                <IconPlus size={14} /> Create Ad
                            </button>
                        )}
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

            {/* ══ Confirmation Modal ══ */}
            {confirmOrder && (
                <div className="modal-overlay" onClick={() => setConfirmOrder(null)}>
                    <div className="modal-content animate-in" onClick={e => e.stopPropagation()}>
                        <h3 className="mb-2">
                            {confirmOrder.type === 'sell' ? '🛒 Buy from this seller?' : '💰 Sell to this buyer?'}
                        </h3>
                        <div className="card-glass p-3 mb-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-muted">Amount</span>
                                <span className="font-mono font-bold">
                                    {(confirmOrder.amount - (confirmOrder.filled_amount || 0)).toFixed(2)} {confirmOrder.token}
                                </span>
                            </div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-muted">Rate</span>
                                <span className="font-mono text-green font-bold">₹{confirmOrder.rate}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted">You Pay/Receive</span>
                                <span className="font-mono font-bold">
                                    ₹{((confirmOrder.amount - (confirmOrder.filled_amount || 0)) * confirmOrder.rate).toLocaleString()}
                                </span>
                            </div>
                            {confirmOrder.username && (
                                <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                                    <span className="text-sm text-muted">Trader</span>
                                    <span className="text-sm">@{confirmOrder.username} {confirmOrder.trust_score && `⭐${confirmOrder.trust_score}%`}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button className="btn btn-secondary flex-1" onClick={() => setConfirmOrder(null)}>
                                Cancel
                            </button>
                            <button className="btn btn-primary flex-1" onClick={confirmTrade}>
                                ✅ Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
