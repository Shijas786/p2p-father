
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
    const [selectedTrade, setSelectedTrade] = useState<string | null>(null);
    const [chatMessages, setChatMessages] = useState<any[]>([]);

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

    async function viewMessages(tradeId: string) {
        // Use a separate loading state or actionLoading if preferred. 
        // For now, let's just fetch without blocking global UI or use local state.
        // Or re-use loading? If we re-use loading, the whole page spinner shows up.
        // Let's use actionLoading for now or just set selectedTrade immediately and show loader in modal.
        setSelectedTrade(tradeId);
        setChatMessages([]); // Clear previous
        try {
            const { messages } = await api.admin.getTradeMessages(tradeId);
            setChatMessages(messages);
        } catch (err: any) {
            alert('Failed to load messages: ' + err.message);
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

    if (loading && !selectedTrade) return <div className="page p-4"><div className="spinner" /></div>;

    return (
        <div className="page p-4">
            <h1 className="text-xl font-bold mb-4 text-red">🛡️ Admin Dashboard</h1>

            {error && <div className="p-3 bg-red/10 border border-red/20 rounded mb-4 text-sm">{error}</div>}

            {selectedTrade && (
                <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#0f172a] rounded-xl w-full max-w-md h-[80vh] flex flex-col border border-gray-800 shadow-2xl overflow-hidden">
                        {/* Header */}
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#1e293b]">
                            <div>
                                <h3 className="font-bold text-white">Using Dispute Chat</h3>
                                <p className="text-xs text-gray-400">Trade #{selectedTrade.slice(0, 8)}</p>
                            </div>
                            <button onClick={() => setSelectedTrade(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                <span className="text-xl text-gray-400">✕</span>
                            </button>
                        </div>

                        {/* Chat Body */}
                        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[#0B1120]">
                            {chatMessages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                                    <span className="text-4xl">💬</span>
                                    <p>No messages in this trade chat yet.</p>
                                </div>
                            ) : (
                                chatMessages.map((msg, idx) => {
                                    // Determine alignment
                                    const isBuyer = msg.sender_role === 'buyer' || msg.user_id === disputes.find(d => d.id === selectedTrade)?.buyer?.username;
                                    const isMe = msg.user_id === 'ME' || msg.is_admin;

                                    const alignRight = isMe;

                                    return (
                                        <div key={msg.id || idx} className={`flex flex-col max-w-[85%] ${alignRight ? 'self-end items-end' : 'self-start items-start'}`}>
                                            <div className="flex items-center gap-2 mb-1 px-1">
                                                <span className={`text-[10px] font-bold uppercase tracking-wider ${alignRight ? 'text-blue-400' : (isBuyer ? 'text-green-400' : 'text-orange-400')
                                                    }`}>
                                                    {msg.first_name || msg.username || (isMe ? 'You' : (isBuyer ? 'Buyer' : 'Seller'))}
                                                </span>
                                                <span className="text-[10px] text-gray-600">
                                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>

                                            <div className={`p-3 rounded-2xl text-sm shadow-sm ${alignRight
                                                    ? 'bg-blue-600 text-white rounded-tr-none'
                                                    : 'bg-[#1e293b] text-gray-200 rounded-tl-none border border-gray-700'
                                                }`}>
                                                {msg.type === 'image' || msg.image_url ? (
                                                    <div className="flex flex-col gap-2">
                                                        <a href={msg.image_url} target="_blank" rel="noopener noreferrer" className="block group relative overflow-hidden rounded-lg">
                                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                                <span className="opacity-0 group-hover:opacity-100 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur">View full</span>
                                                            </div>
                                                            <img
                                                                src={msg.image_url}
                                                                alt="Proof"
                                                                className="max-w-[200px] max-h-[200px] w-full h-auto object-cover rounded-lg bg-black/50"
                                                                loading="lazy"
                                                            />
                                                        </a>
                                                        {msg.message && <p className="pt-1 border-t border-white/10 mt-1">{msg.message}</p>}
                                                    </div>
                                                ) : (
                                                    <p className="leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

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

                            <button
                                className="btn bg-blue-500/20 text-blue-400 w-full mb-3 text-sm py-2"
                                onClick={() => viewMessages(d.id)}
                            >
                                👁️ View Proofs & Chat
                            </button>

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
