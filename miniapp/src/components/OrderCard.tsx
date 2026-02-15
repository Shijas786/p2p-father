import { useState } from 'react';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { IconX } from './Icons';
import './OrderCard.css';

interface Order {
    id: string;
    type: 'buy' | 'sell';
    token: string;
    amount: number;
    filled_amount: number;
    rate: number;
    fiat_currency: string;
    payment_methods: string[];
    username?: string;
    trust_score?: number;
    status: string;
    user_id: string;
}

interface Props {
    order: Order;
    onTap?: (order: Order) => void;
    showActions?: boolean;
    isMyOrder?: boolean;
    onRefresh?: () => void;
}

export function OrderCard({ order, onTap, showActions = true, isMyOrder, onRefresh }: Props) {
    const [cancelling, setCancelling] = useState(false);

    const handleCancel = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to cancel this ad?')) return;

        setCancelling(true);
        try {
            await api.orders.cancel(order.id);
            haptic('success');
            if (onRefresh) onRefresh();
        } catch (err: any) {
            console.error(err);
            haptic('error');
            alert('Failed to cancel order: ' + (err.message || 'Unknown error'));
        } finally {
            setCancelling(false);
        }
    };

    const totalAvailable = order.amount - (order.filled_amount || 0);
    const available = totalAvailable * 0.995; // Fee model: buyer sees 99.5% of locked amount
    const isBuy = order.type === 'buy';

    return (
        <div
            className={`order-card ${showActions ? 'tappable' : ''} ${order.status === 'filled' ? 'opacity-70' : ''}`}
            onClick={() => {
                if (isMyOrder) return; // Don't trigger tap for own orders
                if (showActions && onTap) {
                    haptic('light');
                    onTap(order);
                }
            }}
        >
            <div className="oc-header">
                <span className={`badge ${isBuy ? 'badge-green' : 'badge-red'}`}>
                    {isBuy ? '🟢 BUY' : '🔴 SELL'}
                </span>
                <span className="oc-token font-mono">{order.token}</span>

                {isMyOrder && showActions && (
                    <button
                        className="btn btn-xs btn-secondary ml-auto border-red-500/30 text-red-400 hover:bg-red-500/10"
                        onClick={handleCancel}
                        disabled={cancelling}
                    >
                        {cancelling ? <span className="spinner w-3 h-3 border-red-400" /> : <><IconX size={12} /> Cancel</>}
                    </button>
                )}
            </div>

            <div className="oc-body relative">
                <div className="oc-amount">
                    <span className="label">Available</span>
                    <span className="oc-value font-mono">
                        {available.toFixed(2)} <span className="text-muted">{order.token}</span>
                    </span>
                </div>

                <div className="oc-rate">
                    <span className="label">Rate</span>
                    <span className="oc-value font-mono text-green">
                        ₹{order.rate.toLocaleString()}
                    </span>
                </div>

                {order.status === 'filled' && (
                    <div className="absolute top-0 right-0 bg-black/60 text-white text-[10px] px-2 py-1 rounded backdrop-blur-md border border-white/10 font-bold tracking-wider pointer-events-none transform rotate-12 translate-x-2 -translate-y-2">
                        SOLD OUT
                    </div>
                )}
            </div>

            <div className="oc-footer">
                <div className="oc-user">
                    {order.username && <span className="text-sm">@{order.username}</span>}
                    {order.trust_score !== undefined && (
                        <span className="oc-trust">⭐ {order.trust_score}%</span>
                    )}
                </div>
                <div className="oc-methods">
                    {(order.payment_methods || []).map((m) => (
                        <span key={m} className="oc-method">{m}</span>
                    ))}
                </div>
            </div>
        </div>
    );
}
