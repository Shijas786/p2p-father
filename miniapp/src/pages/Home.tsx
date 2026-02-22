import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import './Home.css';

interface Props {
    user: any;
}

const PAYMENT_FILTERS = ['All', 'UPI', 'IMPS', 'Bank'];

export function Home({ user }: Props) {
    const navigate = useNavigate();
    const [tab, setTab] = useState<'buy' | 'sell'>('buy');
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [feePercentage, setFeePercentage] = useState(0.01);
    const [paymentFilter, setPaymentFilter] = useState('All');
    const [tokenFilter, setTokenFilter] = useState('USDC');

    const formatBal = (val: any, decs = 2) => {
        const num = parseFloat(val || '0');
        if (num > 0 && num < 0.0001) return '0.0000';
        if (num === 0) return '0.00';
        return num.toFixed(decs);
    };
    const [confirmOrder, setConfirmOrder] = useState<any>(null);
    const [tokenDropdown, setTokenDropdown] = useState(false);

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
            const orderType = tab === 'buy' ? 'sell' : 'buy';
            const { orders: data } = await api.orders.list(orderType);
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

    // Filter orders
    const filteredOrders = orders.filter(order => {
        if (order.token !== tokenFilter) return false;
        if (paymentFilter !== 'All') {
            const methods = order.payment_methods || [];
            if (paymentFilter === 'Bank') {
                if (!methods.some((m: string) => ['BANK', 'IMPS', 'NEFT'].includes(m))) return false;
            } else {
                if (!methods.includes(paymentFilter.toUpperCase())) return false;
            }
        }
        return true;
    });

    return (
        <div className="p2p-container">
            <div className="page p2p-page animate-in">
                {/* Buy/Sell Toggle */}
                <div className="p2p-toggle">
                    <button
                        className={`p2p-toggle-btn ${tab === 'buy' ? 'active buy' : ''}`}
                        onClick={() => { haptic('selection'); setTab('buy'); }}
                    >
                        Buy
                    </button>
                    <button
                        className={`p2p-toggle-btn ${tab === 'sell' ? 'active sell' : ''}`}
                        onClick={() => { haptic('selection'); setTab('sell'); }}
                    >
                        Sell
                    </button>
                </div>

                {/* Filters Row */}
                <div className="p2p-filters">
                    <div className="p2p-token-selector" onClick={() => setTokenDropdown(!tokenDropdown)}>
                        <span className="p2p-token-icon">{tokenFilter === 'USDC' ? '🔵' : tokenFilter === 'USDT' ? '🟢' : '🟡'}</span>
                        <span>{tokenFilter}</span>
                        <span className="p2p-chevron">▼</span>
                        {tokenDropdown && (
                            <div className="p2p-dropdown">
                                {['USDC', 'USDT', 'BNB'].map(t => (
                                    <div
                                        key={t}
                                        className={`p2p-dropdown-item ${tokenFilter === t ? 'active' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); setTokenFilter(t); setTokenDropdown(false); }}
                                    >
                                        {t === 'USDC' ? '🔵' : t === 'USDT' ? '🟢' : '🟡'} {t}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p2p-payment-filters">
                        {PAYMENT_FILTERS.map(f => (
                            <button
                                key={f}
                                className={`p2p-filter-chip ${paymentFilter === f ? 'active' : ''}`}
                                onClick={() => { haptic('selection'); setPaymentFilter(f); }}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Trader List */}
                <div className="p2p-list">
                    {loading ? (
                        <div className="p2p-skeletons">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="p2p-skeleton-card">
                                    <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                                    <div style={{ flex: 1 }}>
                                        <div className="skeleton" style={{ width: '60%', height: 14, marginBottom: 8 }} />
                                        <div className="skeleton" style={{ width: '40%', height: 24, marginBottom: 6 }} />
                                        <div className="skeleton" style={{ width: '80%', height: 12 }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filteredOrders.length > 0 ? (
                        filteredOrders.map(order => {
                            const available = (order.amount - (order.filled_amount || 0)) * (1 - feePercentage / 2);
                            const isMine = user?.id === order.user_id;

                            return (
                                <div
                                    key={order.id}
                                    className={`p2p-trader-card ${isMine ? 'is-mine' : ''}`}
                                    onClick={() => !isMine && handleTap(order)}
                                >
                                    <div className="p2p-trader-header">
                                        <div className="p2p-trader-avatar">
                                            {order.photo_url ? (
                                                <img
                                                    src={order.photo_url}
                                                    alt=""
                                                    onError={(e) => {
                                                        e.currentTarget.style.display = 'none';
                                                        e.currentTarget.parentElement!.innerText = order.username?.[0]?.toUpperCase() || '?';
                                                    }}
                                                />
                                            ) : (
                                                order.username?.[0]?.toUpperCase() || '?'
                                            )}
                                        </div>
                                        <div className="p2p-trader-name">
                                            <span className="p2p-username">{order.username || 'Anonymous'}</span>
                                            {order.trust_score >= 90 && <span className="p2p-verified-badge">💎</span>}
                                        </div>
                                        <div className="p2p-trader-stats">
                                            <span className="p2p-stat-text">
                                                {order.trust_score !== undefined && (
                                                    <>Trade(s) {order.completed_trades || 0} | 👍 {order.trust_score}%</>
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p2p-trader-body">
                                        <div className="p2p-price-section">
                                            <div className="p2p-price">
                                                <span className="p2p-currency">₹</span>
                                                <span className="p2p-rate">{order.rate.toLocaleString()}</span>
                                                <span className="p2p-per">/{order.token}</span>
                                            </div>

                                            <div className="p2p-available">
                                                <span className="p2p-avail-label">Available</span>
                                                <span className="p2p-avail-value">{formatBal(available, order.token === 'BNB' ? 4 : 2)} {order.token}</span>
                                            </div>
                                        </div>

                                        <div className="p2p-action-section">
                                            <div className="p2p-methods">
                                                {(order.payment_methods || []).map((m: string) => (
                                                    <span key={m} className="p2p-method-tag">{m}</span>
                                                ))}
                                            </div>
                                            {!isMine && (
                                                <button
                                                    className={`p2p-action-btn ${tab === 'buy' ? 'buy' : 'sell'}`}
                                                    onClick={(e) => { e.stopPropagation(); handleTap(order); }}
                                                >
                                                    {tab === 'buy' ? 'Buy' : 'Sell'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="p2p-divider" />
                                </div>
                            );
                        })
                    ) : (
                        <div className="p2p-empty">
                            <div className="p2p-empty-icon">📋</div>
                            <h3>No {tab === 'buy' ? 'sellers' : 'buyers'} found</h3>
                            <p>{paymentFilter !== 'All' ? `No ${paymentFilter} orders available` : 'Be the first to create an ad!'}</p>
                            <button className="p2p-create-btn" onClick={() => navigate('/ads')}>
                                + Post Ad
                            </button>
                        </div>
                    )}
                </div>

                {/* ═══ Confirmation Modal ═══ */}
                {confirmOrder && createPortal(
                    <div className="p2p-modal-overlay" onClick={() => setConfirmOrder(null)}>
                        <div className="p2p-modal animate-slide-up" onClick={e => e.stopPropagation()}>
                            <h3 className="p2p-modal-title">
                                {tab === 'buy' ? '🛒 Buy from this seller?' : '💰 Sell to this buyer?'}
                            </h3>
                            <div className="p2p-modal-details">
                                <div className="p2p-modal-row">
                                    <span>Amount</span>
                                    <span className="font-mono font-bold">
                                        {formatBal((confirmOrder.amount - (confirmOrder.filled_amount || 0)) * (1 - feePercentage / 2), confirmOrder.token === 'BNB' ? 4 : 2)} {confirmOrder.token}
                                    </span>
                                </div>
                                <div className="p2p-modal-row">
                                    <span>Rate</span>
                                    <span className="font-mono" style={{ color: '#0ecb81' }}>₹{confirmOrder.rate}</span>
                                </div>
                                <div className="p2p-modal-row">
                                    <span>Total</span>
                                    <span className="font-mono font-bold">
                                        ₹{(((confirmOrder.amount - (confirmOrder.filled_amount || 0)) * (1 - feePercentage / 2)) * confirmOrder.rate).toLocaleString()}
                                    </span>
                                </div>
                                {confirmOrder.username && (
                                    <div className="p2p-modal-row" style={{ borderTop: '1px solid #2b2f36', paddingTop: 10 }}>
                                        <span>Trader</span>
                                        <span>@{confirmOrder.username}</span>
                                    </div>
                                )}
                            </div>
                            <div className="p2p-modal-actions">
                                <button className="p2p-modal-cancel" onClick={() => setConfirmOrder(null)}>Cancel</button>
                                <button className={`p2p-modal-confirm ${tab}`} onClick={confirmTrade}>✅ Confirm</button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </div>
            <div style={{ textAlign: 'center', opacity: 0.3, fontSize: 10, padding: '10px 0 20px', color: 'white' }}>P2P Kerala v4.1 (BNB Fixed)</div>
        </div>
    );
}
