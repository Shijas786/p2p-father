
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
        <div className="page p-4 pb-10">
            <h1 className="text-xl font-bold mb-4 text-red">🛡️ Admin Dashboard</h1>

            {error && <div className="p-3 bg-red/10 border border-red/20 rounded mb-4 text-sm">{error}</div>}

            {disputes.length === 0 ? (
                <div className="text-center text-muted py-20 bg-white/5 rounded-xl border border-white/5">
                    <div className="text-4xl mb-4">🕊️</div>
                    <p className="text-sm">No active disputes. Peace reigns.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {disputes.map(d => (
                        <div key={d.id} className="card border-red p-0 overflow-hidden bg-[#0f172a]">
                            {/* Card Header */}
                            <div className="p-3 border-b border-white/5 bg-white/5">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-mono text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">#{d.id.slice(0, 8)}</span>
                                    <span className="text-[10px] text-gray-500">{new Date(d.created_at).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <div className="text-lg font-bold text-white">{d.amount} {d.token}</div>
                                        <div className="text-xs text-muted">Value: ₹{d.fiat_amount?.toLocaleString()}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-500 uppercase font-bold">Parties</div>
                                        <div className="text-xs">
                                            <span className="text-green-400">@{d.buyer?.username}</span>
                                            <span className="mx-1 text-gray-600">vs</span>
                                            <span className="text-orange-400">@{d.seller?.username}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Escrow Lock Info (Old Style) */}
                            <div className="mx-3 mt-3 p-2 bg-orange-500/10 border border-orange-500/20 rounded text-[11px]">
                                <span className="font-bold flex items-center gap-1" style={{ color: '#f97316' }}>
                                    🔒 Seller's {d.amount} {d.token} locked in escrow
                                </span>
                                <div className="text-gray-400 mt-0.5 ml-4">
                                    <span className="text-green-400/80">Release</span> → goes to buyer | <span className="text-red-400/80">Refund</span> → returns to seller
                                </div>
                            </div>

                            {/* Reason */}
                            <div className="px-3 pt-3">
                                <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Reason</div>
                                <p className="text-xs text-gray-300 italic bg-black/20 p-2 rounded">
                                    "{d.dispute_reason}"
                                </p>
                            </div>

                            {/* Embedded Chat Area */}
                            <div className="px-3 py-3">
                                <div className="text-[10px] text-gray-500 uppercase font-bold mb-1 flex justify-between">
                                    <span>💬 Trade Chat</span>
                                    <span>{d.chatMessages?.length || 0} messages</span>
                                </div>
                                <div className="bg-black/40 border border-white/5 rounded-xl overflow-hidden flex flex-col h-[250px]">
                                    {/* Messages List */}
                                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                                        {d.chatMessages?.length === 0 ? (
                                            <div className="h-full flex items-center justify-center text-[11px] text-gray-600">
                                                No messages yet.
                                            </div>
                                        ) : (
                                            d.chatMessages?.map((msg: any, idx: number) => {
                                                const isBuyer = msg.sender_role === 'buyer' || msg.user_id === d.buyer?.username;
                                                const isAdmin = msg.sender_role === 'admin' || user?.admin_ids?.includes(msg.telegram_id);
                                                const isMe = msg.telegram_id === user.telegram_id;
                                                
                                                return (
                                                    <div key={idx} className={`flex flex-col max-w-[90%] ${isMe ? 'self-end' : 'self-start'}`}>
                                                        <div className={`text-[9px] font-bold mb-0.5 px-1 truncate ${isAdmin ? (isMe ? 'text-blue-400' : 'text-purple-400') : (isBuyer ? 'text-green-400' : 'text-orange-400')}`}>
                                                            {isAdmin ? (isMe ? '🛡️ Admin (You)' : `🛡️ Admin (${msg.first_name || 'Admin'})`) : (msg.first_name || msg.username || (isBuyer ? 'Buyer' : 'Seller'))}
                                                        </div>
                                                        <div className={`p-2 rounded-lg text-xs shadow-sm ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : (isAdmin ? 'bg-purple-900/40 text-gray-200 border border-purple-500/30' : 'bg-gray-800 text-gray-200 rounded-tl-none border border-white/5')}`}>
                                                            {msg.image_url ? (
                                                                <div className="flex flex-col gap-1">
                                                                    <img src={msg.image_url} alt="Proof" className="max-w-[150px] rounded" />
                                                                    {msg.message && <p>{msg.message}</p>}
                                                                </div>
                                                            ) : (
                                                                <p className="whitespace-pre-wrap">{msg.message}</p>
                                                            )}
                                                            <div className="text-[8px] opacity-40 text-right mt-1">
                                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                        <div ref={el => chatEndRefs.current[d.id] = el} />
                                    </div>

                                    {/* Small Input Area */}
                                    <div className="p-2 bg-white/5 border-t border-white/5 flex gap-2">
                                        <input
                                            type="text"
                                            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                                            placeholder="Reply to traders..."
                                            value={newMessages[d.id] || ''}
                                            onChange={(e) => setNewMessages(prev => ({ ...prev, [d.id]: e.target.value }))}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(d.id)}
                                            disabled={sendingMessage[d.id]}
                                        />
                                        <button
                                            className={`p-1.5 px-3 rounded-lg bg-blue-600 text-[10px] font-bold text-white transition-opacity ${sendingMessage[d.id] || !(newMessages[d.id]?.trim()) ? 'opacity-50' : 'hover:bg-blue-500'}`}
                                            onClick={() => handleSendMessage(d.id)}
                                            disabled={sendingMessage[d.id] || !(newMessages[d.id]?.trim())}
                                        >
                                            {sendingMessage[d.id] ? <span className="spinner-sm" /> : 'SEND'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Resolution Buttons */}
                            <div className="p-3 bg-white/5 flex gap-2 border-t border-white/5">
                                <button
                                    className="flex-1 py-3 rounded-xl bg-green-500/20 hover:bg-green-500/30 text-green-400 text-xs font-black tracking-widest border border-green-500/30 transition-all active:scale-95 flex flex-col items-center"
                                    onClick={() => resolve(d.id, true)}
                                    disabled={actionLoading}
                                >
                                    <span>RELEASE</span>
                                    <span className="text-[9px] opacity-60 font-medium">To Buyer</span>
                                </button>
                                <button
                                    className="flex-1 py-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-black tracking-widest border border-red-500/30 transition-all active:scale-95 flex flex-col items-center"
                                    onClick={() => resolve(d.id, false)}
                                    disabled={actionLoading}
                                >
                                    <span>REFUND</span>
                                    <span className="text-[9px] opacity-60 font-medium">To Seller</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
