
import { useState, useEffect, useRef } from 'react';
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
    chatMessages?: any[];
}

interface Props {
    user: any;
}

export function Admin({ user }: Props) {
    const [disputes, setDisputes] = useState<Dispute[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');
    const [newMessages, setNewMessages] = useState<Record<string, string>>({});
    const [sendingMessage, setSendingMessage] = useState<Record<string, boolean>>({});
    const chatEndRefs = useRef<Record<string, HTMLDivElement | null>>({});

    useEffect(() => {
        loadDisputes();
    }, []);

    useEffect(() => {
        // Auto-scroll all chats to bottom on load/update
        disputes.forEach(d => {
            if (chatEndRefs.current[d.id]) {
                chatEndRefs.current[d.id]?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }, [disputes]);

    async function loadDisputes() {
        setLoading(true);
        try {
            const { disputes: loaded } = await api.admin.getDisputes();
            const disputeList = loaded || [];

            // Auto-load chat messages for each dispute
            const withChats = await Promise.all(
                disputeList.map(async (d: Dispute) => {
                    try {
                        const { messages } = await api.admin.getTradeMessages(d.id);
                        return { ...d, chatMessages: messages || [] };
                    } catch {
                        return { ...d, chatMessages: [] };
                    }
                })
            );
            setDisputes(withChats);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to load disputes');
        } finally {
            setLoading(false);
        }
    }

    async function handleSendMessage(tradeId: string) {
        const msg = newMessages[tradeId];
        if (!msg?.trim()) return;

        setSendingMessage(prev => ({ ...prev, [tradeId]: true }));
        try {
            await api.admin.sendMessage(tradeId, msg.trim());
            setNewMessages(prev => ({ ...prev, [tradeId]: '' }));
            haptic('light');
            
            // Reload messages for this specific trade
            const { messages } = await api.admin.getTradeMessages(tradeId);
            setDisputes(prev => prev.map(d => d.id === tradeId ? { ...d, chatMessages: messages } : d));
            
            // Scroll to bottom
            setTimeout(() => {
                chatEndRefs.current[tradeId]?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        } catch (err: any) {
            alert('Failed to send message: ' + err.message);
        } finally {
            setSendingMessage(prev => ({ ...prev, [tradeId]: false }));
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
        <div className="page">
            <header className="page-header">
                <h1 className="page-title text-red">🛡️ Admin Dashboard</h1>
                <p className="page-subtitle">Dispute Resolution Center</p>
            </header>

            {error && <div className="p-3 bg-red/10 border border-red/20 rounded mb-4 text-sm">{error}</div>}

            {disputes.length === 0 ? (
                <div className="empty-state">
                    <div className="icon">🕊️</div>
                    <h3 className="text-secondary">No active disputes</h3>
                    <p className="text-muted">Everything is running smoothly.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {disputes.map(d => (
                        <div key={d.id} className="card flex flex-col gap-3">
                            {/* Header */}
                            <div className="flex justify-between items-start border-b border-white/5 pb-2">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="badge badge-red font-mono">#{d.id.slice(0, 8)}</span>
                                        <span className="text-sm font-bold text-white">{d.amount} {d.token}</span>
                                    </div>
                                    <div className="text-[10px] text-muted">{new Date(d.created_at).toLocaleString()}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[11px] font-bold text-orange">₹{d.fiat_amount?.toLocaleString()}</div>
                                    <div className="text-[10px] text-muted">@{d.buyer?.username} vs @{d.seller?.username}</div>
                                </div>
                            </div>

                            {/* Escrow Status Tag */}
                            <div className="p-2 bg-orange/5 border border-orange/10 rounded flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-orange flex items-center gap-1">
                                    🔒 SECURE ESCROW: {d.amount} {d.token}
                                </span>
                                <div className="text-[9px] text-muted leading-tight">
                                    Release → Buyer gets funds | Refund → Seller gets funds
                                </div>
                            </div>

                            {/* Chat Preview (Scrollable Window) */}
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-center text-[10px] font-bold text-muted uppercase tracking-wider px-1">
                                    <span>Chat History</span>
                                    <span>{d.chatMessages?.length || 0} msgs</span>
                                </div>
                                
                                <div className="bg-black/30 rounded-lg border border-white/5 h-[140px] overflow-y-scroll p-2 flex flex-col gap-1.5 custom-scrollbar">
                                    {d.chatMessages?.length === 0 ? (
                                        <div className="flex-1 flex items-center justify-center text-[10px] text-muted italic">
                                            No messages yet.
                                        </div>
                                    ) : (
                                        d.chatMessages?.map((msg: any, idx: number) => {
                                            const isBuyer = msg.sender_role === 'buyer' || msg.user_id === d.buyer?.username;
                                            const isAdmin = msg.sender_role === 'admin' || user?.admin_ids?.includes(msg.telegram_id);
                                            const isMe = msg.telegram_id === user.telegram_id;
                                            
                                            return (
                                                <div key={idx} className={`flex flex-col max-w-[85%] ${isMe ? 'self-end' : 'self-start'}`}>
                                                    <div className={`text-[8px] font-bold mb-0.5 px-0.5 truncate ${isAdmin ? (isMe ? 'text-blue' : 'text-purple-400') : (isBuyer ? 'text-green' : 'text-orange')}`}>
                                                        {isAdmin ? (isMe ? '🛡️ Admin' : `🛡️ Admin (${msg.first_name || 'Staff'})`) : (msg.first_name || msg.username || (isBuyer ? 'Buyer' : 'Seller'))}
                                                    </div>
                                                    <div className={`p-2 rounded-lg text-xs shadow-sm ${isMe ? 'bg-blue text-white rounded-tr-none' : (isAdmin ? 'bg-purple-900/40 text-gray-200 border border-purple-500/20' : 'bg-secondary text-gray-200 rounded-tl-none border border-white/5')}`}>
                                                        {msg.image_url ? (
                                                            <div className="flex flex-col gap-1">
                                                                <img src={msg.image_url} alt="Proof" className="max-w-[140px] rounded border border-white/10" />
                                                                {msg.message && <p className="leading-tight">{msg.message}</p>}
                                                            </div>
                                                        ) : (
                                                            <p className="whitespace-pre-wrap leading-tight">{msg.message}</p>
                                                        )}
                                                        <div className="text-[7px] opacity-40 text-right mt-1">
                                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={el => chatEndRefs.current[d.id] = el} />
                                </div>

                                {/* Reply Input */}
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-muted"
                                        placeholder="Reply traders..."
                                        value={newMessages[d.id] || ''}
                                        onChange={(e) => setNewMessages(prev => ({ ...prev, [d.id]: e.target.value }))}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(d.id)}
                                        disabled={sendingMessage[d.id]}
                                    />
                                    <button
                                        className={`btn btn-primary btn-sm px-3 ${sendingMessage[d.id] || !(newMessages[d.id]?.trim()) ? 'opacity-50' : ''}`}
                                        onClick={() => handleSendMessage(d.id)}
                                        disabled={sendingMessage[d.id] || !(newMessages[d.id]?.trim())}
                                    >
                                        {sendingMessage[d.id] ? <div className="spinner" style={{width: 12, height: 12}} /> : 'SEND'}
                                    </button>
                                </div>
                            </div>

                            {/* Resolution Controls */}
                            <div className="flex gap-2 pt-1">
                                <button
                                    className="btn btn-block btn-sm bg-green/10 text-green border border-green/20 hover:bg-green/20"
                                    onClick={() => resolve(d.id, true)}
                                    disabled={actionLoading}
                                >
                                    <span className="flex flex-col items-center">
                                        <span className="font-bold">RELEASE</span>
                                        <span className="text-[8px] opacity-70">To Buyer</span>
                                    </span>
                                </button>
                                <button
                                    className="btn btn-block btn-sm bg-red/10 text-red border border-red/20 hover:bg-red/20"
                                    onClick={() => resolve(d.id, false)}
                                    disabled={actionLoading}
                                >
                                    <span className="flex flex-col items-center">
                                        <span className="font-bold">REFUND</span>
                                        <span className="text-[8px] opacity-70">To Seller</span>
                                    </span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
