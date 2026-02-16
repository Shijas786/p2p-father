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
    feePercentage?: number;
}

export function OrderCard({ order, onTap, showActions = true, isMyOrder, onRefresh, feePercentage = 0.01 }: Props) {
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
    const available = totalAvailable * (1 - feePercentage / 2); // Dynamic fee: buyer sees amount minus seller's half of fee
    const isBuy = order.type === 'buy';

    return (
        <div
            className={`order-card ${showActions ? 'tappable' : ''} ${order.status === 'filled' ? 'opacity-70' : ''}`}
            onClick={() => {
                if (isMyOrder) return;
                if (showActions && onTap) {
                    haptic('light');
                    onTap(order);
                }
            }}
        >
            <div className="oc-main-row">
                <div className="oc-left">
                    <div className="oc-top-meta">
                        <span className={`badge ${isBuy ? 'badge-green' : 'badge-red'} oc-type-badge`}>
                            {isBuy ? 'BUY' : 'SELL'}
                        </span>
                        {order.username && <span className="oc-username">@{order.username}</span>}
                        {order.trust_score !== undefined && (
                            <span className={`oc-trust-compact ${order.trust_score >= 90 ? 'trust-high' : order.trust_score >= 70 ? 'trust-mid' : 'trust-low'}`}>
                                ⭐{order.trust_score}%
                            </span>
                        )}
                    </div>

                    <div className="oc-details">
                        <span className="oc-available-text">
                            {available.toFixed(2)} <span className="oc-token-small">{order.token}</span>
                        </span>
                        <div className="oc-methods-compact">
                            {(order.payment_methods || []).map((m) => (
                                <span key={m} title={m}>
                                    {m === 'UPI' ? '📱' : m === 'IMPS' ? '🏦' : m === 'BANK' ? '🏛️' : m === 'PAYTM' ? '💳' : m === 'NEFT' ? '🔄' : '💰'}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="oc-right">
                    <div className="oc-rate-emphasized font-mono text-green">
                        ₹{order.rate.toLocaleString()}
                    </div>
                    {isMyOrder && showActions && (
                        <button
                            className="oc-cancel-btn"
                            onClick={handleCancel}
                            disabled={cancelling}
                        >
                            {cancelling ? <span className="spinner w-3 h-3 border-red-400" /> : <IconX size={12} />}
                        </button>
                    )}
                </div>
            </div>

            {order.status === 'filled' && (
                <div className="oc-sold-out-overlay">SOLD OUT</div>
            )}
        </div>
    );
}
