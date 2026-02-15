
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';

interface Dispute {
    id: string;
    amount: string;
    token: string;
    fiat_amount: number;
    dispute_reason: string;
    buyer: { username: string; first_name: string };
    seller: { username: string; first_name: string };
    created_at: string;
}

export function Admin() {
    const [disputes, setDisputes] = useState<Dispute[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        loadDisputes();
    }, []);

    async function loadDisputes() {
        setLoading(true);
        try {
            const { disputes } = await api.admin.getDisputes();
            setDisputes(disputes || []);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to load disputes');
        } finally {
            setLoading(false);
        }
    }

    async function resolve(tradeId: string, releaseToBuyer: boolean) {
        const action = releaseToBuyer ? "RELEASE to Buyer" : "REFUND to Seller";
        if (!confirm(`Are you sure you want to ${action}? This is irreversible.`)) return;

        setActionLoading(true);
        haptic('warning');
        try {
            await api.admin.resolveDispute(tradeId, releaseToBuyer);
            haptic('success');
            alert('Success!');
            loadDisputes();
        } catch (err: any) {
            alert('Error: ' + err.message);
            haptic('error');
        } finally {
            setActionLoading(false);
        }
    }

    if (loading) return <div className="page p-4"><div className="spinner" /></div>;

    return (
        <div className="page p-4">
            <h1 className="text-xl font-bold mb-4 text-red">🛡️ Admin Dashboard</h1>

            {error && <div className="p-3 bg-red/10 border border-red/20 rounded mb-4 text-sm">{error}</div>}

            {disputes.length === 0 ? (
                <div className="text-center text-muted py-10">
                    No active disputes. Peace reigns 🕊️
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {disputes.map(d => (
                        <div key={d.id} className="card border-red">
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-mono text-xs bg-white/10 px-1 rounded">#{d.id.slice(0, 8)}</span>
                                <span className="text-xs text-muted">{new Date(d.created_at).toLocaleDateString()}</span>
                            </div>

                            <div className="mb-3">
                                <div className="text-lg font-bold">
                                    {d.amount} {d.token}
                                </div>
                                <div className="text-sm text-muted">Value: ₹{d.fiat_amount}</div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs mb-3 bg-black/20 p-2 rounded">
                                <div>
                                    <div className="text-muted">Buyer</div>
                                    <div className="font-bold text-green">{d.buyer?.first_name}</div>
                                    <div className="opacity-50">@{d.buyer?.username || 'no_user'}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-muted">Seller</div>
                                    <div className="font-bold text-orange">{d.seller?.first_name}</div>
                                    <div className="opacity-50">@{d.seller?.username || 'no_user'}</div>
                                </div>
                            </div>

                            <div className="mb-4">
                                <div className="text-xs text-muted uppercase font-bold mb-1">Reason</div>
                                <div className="p-2 bg-red/5 rounded text-sm italic">
                                    "{d.dispute_reason}"
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    className="btn btn-success flex-1 text-xs"
                                    onClick={() => resolve(d.id, true)}
                                    disabled={actionLoading}
                                >
                                    ✅ Release to Buyer
                                </button>
                                <button
                                    className="btn btn-danger flex-1 text-xs"
                                    onClick={() => resolve(d.id, false)}
                                    disabled={actionLoading}
                                >
                                    🔙 Refund Seller
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
