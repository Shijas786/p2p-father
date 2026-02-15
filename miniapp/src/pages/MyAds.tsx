import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { OrderCard } from '../components/OrderCard';
import { IconEmpty, IconRefresh, IconPlus, IconX } from '../components/Icons';
import './MyAds.css';
import { useNavigate } from 'react-router-dom';

export function MyAds() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [cancellingId, setCancellingId] = useState<string | null>(null);

    useEffect(() => {
        loadMyAds();
    }, []);

    async function loadMyAds() {
        setLoading(true);
        try {
            const { orders: data } = await api.orders.mine();

            // Sort by latest first
            setOrders((data || []).sort((a: any, b: any) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
        } catch (err) {
            console.error('Failed to load my ads:', err);
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }

    async function handleCancel(id: string) {
        if (!window.confirm('Are you sure you want to cancel this ad? Funds will remain in your P2P Vault (Escrow Balance) for your next ad. You can withdraw them back to your wallet anytime from the Wallet page.')) return;

        haptic('medium');
        setCancellingId(id);
        try {
            await api.orders.cancel(id);
            haptic('success');
            // Optimistic update or reload
            setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'cancelled' } : o));
        } catch (err: any) {
            alert(err.message || 'Failed to cancel ad');
            haptic('error');
        } finally {
            setCancellingId(null);
        }
    }

    return (
        <div className="page animate-in">
            <div className="page-header">
                <h1 className="page-title">My Ads</h1>
                <p className="page-subtitle">Manage your active marketplace listings</p>
            </div>

            <div className="my-ads-list">
                {loading ? (
                    <div className="flex flex-col gap-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="skeleton" style={{ height: 140, borderRadius: 16 }} />
                        ))}
                    </div>
                ) : (
                    <>
                        {/* ACTIVE ORDERS */}
                        <div className="section-header">
                            <h2 className="text-lg font-bold mb-2">Active Listings</h2>
                        </div>

                        {orders.filter(o => o.status === 'active').length > 0 ? (
                            orders.filter(o => o.status === 'active').map(order => (
                                <div key={order.id} className="my-ad-item mb-4">
                                    <OrderCard order={order} showActions={false} />
                                    <div className="my-ad-actions mt-2">
                                        <button
                                            className="btn btn-secondary btn-sm flex-1"
                                            style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                            onClick={() => handleCancel(order.id)}
                                            disabled={cancellingId === order.id}
                                        >
                                            {cancellingId === order.id ? (
                                                <span className="spinner" />
                                            ) : (
                                                <><IconX size={14} /> Cancel Ad</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="empty-state-card card-glass text-center p-6 mb-6">
                                <p className="text-muted mb-3">No active ads running.</p>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => navigate('/create')}
                                >
                                    <IconPlus size={16} /> Create New Ad
                                </button>
                            </div>
                        )}

                        {/* HISTORY */}
                        {orders.filter(o => o.status !== 'active').length > 0 && (
                            <div className="history-section mt-8">
                                <h2 className="text-lg font-bold mb-2 text-muted">History</h2>
                                <div className="flex flex-col gap-3 opacity-80 hover:opacity-100 transition-opacity">
                                    {orders.filter(o => o.status !== 'active').map(order => (
                                        <div key={order.id} className="relative grayscale-[0.5] hover:grayscale-0 transition-all">
                                            <OrderCard order={order} showActions={false} />
                                            <div className={`status-badge-overlay status-${order.status}`}>
                                                {order.status.toUpperCase()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {orders.length > 0 && (
                <button
                    className="btn btn-secondary btn-block mt-4"
                    onClick={() => { haptic('light'); loadMyAds(); }}
                    disabled={loading}
                >
                    {loading ? <span className="spinner" /> : <IconRefresh size={16} />} Refresh List
                </button>
            )}
        </div>
    );
}
