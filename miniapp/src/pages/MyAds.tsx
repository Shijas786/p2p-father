import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { OrderCard } from '../components/OrderCard';
import { IconHistory, IconRefresh, IconArrowLeft } from '../components/Icons';
import './MyAds.css'; // We can keep the CSS file for now

interface Props {
    user: any;
}

export function MyAds({ user }: Props) {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadOrders();
    }, []);

    async function loadOrders() {
        setLoading(true);
        try {
            const [{ orders: adsData }, { trades: tradesData }] = await Promise.all([
                api.orders.mine(),
                api.trades.mine()
            ]);

            // Filter out active orders (only history)
            const adsHistory = (adsData || []).filter((o: any) => o.status !== 'active');

            // Format trades to look like orders for the OrderCard
            const tradesHistory = (tradesData || []).map((t: any) => ({
                id: t.id,
                type: t.buyer_id === user?.id ? 'buy' : 'sell', // User role
                token: t.token,
                chain: t.chain,
                amount: t.amount,
                rate: t.rate,
                status: t.status,
                created_at: t.created_at,
                is_trade: true // Flag to distinguish
            }));

            // Merge and sort by date
            const merged = [...adsHistory, ...tradesHistory].sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );

            setOrders(merged);
        } catch {
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="page animate-in">
            <div className="page-header flex items-center gap-3">
                <button className="btn-icon" onClick={() => navigate(-1)}>
                    <IconArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="page-title">Order History</h1>
                    <p className="page-subtitle">Your past deals</p>
                </div>
            </div>

            <div className="my-ads-list mt-4">
                {loading ? (
                    <div className="flex flex-col gap-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="skeleton" style={{ height: 100, borderRadius: 12 }} />
                        ))}
                    </div>
                ) : orders.length > 0 ? (
                    <div className="flex flex-col gap-3">
                        {orders.map(order => (
                            <div
                                key={order.id}
                                className="relative grayscale-[0.2] opacity-90 tappable"
                                onClick={() => order.is_trade && navigate(`/trade/${order.id}`)}
                            >
                                <OrderCard order={order} showActions={false} />
                                <div className={`status-badge-overlay status-${order.status}`}>
                                    {order.status.toUpperCase()}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-state-card card-glass text-center p-8">
                        <div className="flex justify-center mb-4 opacity-50">
                            <IconHistory size={48} />
                        </div>
                        <h3 className="text-lg font-bold">No History Yet</h3>
                        <p className="text-muted text-sm">Your filled and cancelled orders will appear here.</p>
                    </div>
                )}
            </div>

            {/* Refresh */}
            <button
                className="btn btn-secondary btn-block mt-6"
                onClick={() => { haptic('light'); loadOrders(); }}
                disabled={loading}
            >
                {loading ? <span className="spinner" /> : <IconRefresh size={16} />} Refresh History
            </button>
        </div>
    );
}
