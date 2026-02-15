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
    const [debugInfo, setDebugInfo] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [cancellingId, setCancellingId] = useState<string | null>(null);

    useEffect(() => {
        loadMyAds();
    }, []);

    async function loadMyAds() {
        setLoading(true);
        try {
            const data = await api.orders.mine();
            setDebugInfo((data as any).debug_user);

            // Sort by latest first
            setOrders((data.orders || []).sort((a: any, b: any) =>
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
                {/* DEBUG SECTION */}
                <div style={{ padding: 10, background: '#333', color: '#0f0', fontSize: 10, marginBottom: 20 }}>
                    DEBUG: Loading={loading.toString()} Count={orders.length}
                    <br />
                    USER: {debugInfo ? `${debugInfo.username} (ID: ${debugInfo.id})` : 'Loading...'}
                    <pre>{JSON.stringify(orders, null, 2)}</pre>
                </div>

                {loading ? (
                    <div className="flex flex-col gap-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="skeleton" style={{ height: 140, borderRadius: 16 }} />
                        ))}
                    </div>
                ) : orders.length > 0 ? (
                    orders.map(order => (
                        <div key={order.id} className="my-ad-item">
                            <OrderCard order={order} showActions={false} />

                            <div className={`status-badge status-${order.status}`}>
                                {order.status}
                            </div>

                            {order.status === 'active' && (
                                <div className="my-ad-actions">
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
                            )}
                        </div>
                    ))
                ) : (
                    <div className="empty-my-ads">
                        <IconEmpty size={64} color="rgba(255,255,255,0.1)" />
                        <h3>You haven't posted any ads yet</h3>
                        <p className="text-sm">Create an ad to start trading on P2P Kerala.</p>
                        <button
                            className="btn btn-primary mt-4"
                            onClick={() => navigate('/create')}
                        >
                            <IconPlus size={18} /> Create Your First Ad
                        </button>
                    </div>
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
