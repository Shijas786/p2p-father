
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
    const [selectedTrade, setSelectedTrade] = useState<string | null>(null);
    const [chatMessages, setChatMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sendingMessage, setSendingMessage] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadDisputes();
    }, []);

    useEffect(() => {
        if (selectedTrade) {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, selectedTrade]);

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

    async function viewMessages(tradeId: string) {
        setSelectedTrade(tradeId);
        setChatMessages([]);
        try {
            const { messages } = await api.admin.getTradeMessages(tradeId);
            setChatMessages(messages);
        } catch (err: any) {
            alert('Failed to load messages: ' + err.message);
        }
    }

    async function handleSendMessage() {
        if (!selectedTrade || !newMessage.trim()) return;
        setSendingMessage(true);
        try {
            await api.admin.sendMessage(selectedTrade, newMessage.trim());
            setNewMessage('');
            haptic('light');
            // Reload messages
            const { messages } = await api.admin.getTradeMessages(selectedTrade);
            setChatMessages(messages);
            // Also update the preview in the list
            setDisputes(prev => prev.map(d => d.id === selectedTrade ? { ...d, chatMessages: messages } : d));
        } catch (err: any) {
            alert('Failed to send message: ' + err.message);
        } finally {
            setSendingMessage(false);
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
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#1e293b]">
                            <div>
                                <h3 className="font-bold text-white">Dispute Chat</h3>
                                <p className="text-xs text-gray-400">Trade #{selectedTrade.slice(0, 8)}</p>
                            </div>
                            <button onClick={() => setSelectedTrade(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                <span className="text-xl text-gray-400">✕</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[#0B1120]">
                            {chatMessages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                                    <span className="text-4xl">💬</span>
                                    <p>No messages in this trade chat yet.</p>
                                </div>
                            ) : (
                                chatMessages.map((msg, idx) => {
                                    const isBuyer = msg.sender_role === 'buyer' || msg.user_id === disputes.find(d => d.id === selectedTrade)?.buyer?.username;
                                    const isAdmin = msg.sender_role === 'admin' || user?.admin_ids?.includes(msg.telegram_id);
                                    const isMe = msg.telegram_id === user.telegram_id;
                                    const alignRight = isMe;

                                    return (
                                        <div key={msg.id || idx} className={`flex flex-col max-w-[85%] ${alignRight ? 'self-end items-end' : 'self-start items-start'}`}>
                                            <div className="flex items-center gap-2 mb-1 px-1">
                                                <span className={`text-[10px] font-bold uppercase tracking-wider ${isAdmin ? (isMe ? 'text-blue-400' : 'text-purple-400') : (isBuyer ? 'text-green-400' : 'text-orange-400')}`}>
                                                    {isAdmin ? (isMe ? '🛡️ Admin (You)' : `🛡️ Admin (${msg.first_name || msg.username || 'Admin'})`) : (msg.first_name || msg.username || (isBuyer ? 'Buyer' : 'Seller'))}
                                                </span>
                                                <span className="text-[10px] text-gray-600">
                                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <div className={`p-3 rounded-2xl text-sm shadow-sm ${alignRight ? 'bg-blue-600 text-white rounded-tr-none' : (isAdmin ? 'bg-purple-900/40 text-gray-200 border border-purple-500/30' : 'bg-[#1e293b] text-gray-200 rounded-tl-none border border-gray-700')}`}>
                                                {msg.type === 'image' || msg.image_url ? (
                                                    <div className="flex flex-col gap-2">
                                                        <a href={msg.image_url} target="_blank" rel="noopener noreferrer" className="block group relative overflow-hidden rounded-lg">
                                                            <img src={msg.image_url} alt="Proof" className="max-w-[200px] max-h-[200px] w-full h-auto object-cover rounded-lg bg-black/50" loading="lazy" />
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
                            <div ref={chatEndRef} />
                        </div>

                        <div className="p-3 bg-[#1e293b] border-t border-gray-800 flex gap-2">
                            <input
                                type="text"
                                className="flex-1 bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                placeholder="Type a message to traders..."
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                disabled={sendingMessage}
                            />
                            <button
                                className={`p-2 rounded-lg bg-blue-600 text-white transition-opacity ${sendingMessage || !newMessage.trim() ? 'opacity-50' : 'hover:bg-blue-500'}`}
                                onClick={handleSendMessage}
                                disabled={sendingMessage || !newMessage.trim()}
                            >
                                {sendingMessage ? <span className="spinner-sm" /> : 'Send'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {disputes.length === 0 ? (
                <div className="text-center text-muted py-10 bg-white/5 rounded-xl border border-white/5 mx-auto max-w-sm">
                    <div className="text-3xl mb-2">🕊️</div>
                    <p className="text-sm">No active disputes. Peace reigns.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {disputes.map(d => (
                        <div key={d.id} className="card-glass border-red/30 p-3 relative overflow-hidden">
                            {/* Accent line */}
                            <div className="absolute top-0 left-0 w-1 h-full bg-red-500/50" />

                            <div className="flex justify-between items-center mb-2 px-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">#{d.id.slice(0, 8)}</span>
                                    <span className="text-sm font-bold text-white">{d.amount} {d.token}</span>
                                </div>
                                <span className="text-[10px] text-gray-500">{new Date(d.created_at).toLocaleDateString()}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 p-2 bg-black/30 rounded-lg mb-2 text-[11px] border border-white/5 items-center">
                                <div className="flex flex-col">
                                    <span className="text-gray-500 text-[9px] uppercase font-bold">Buyer</span>
                                    <span className="font-bold text-green-400 truncate">@{d.buyer?.username || 'user'}</span>
                                </div>
                                <div className="flex flex-col text-right">
                                    <span className="text-gray-500 text-[9px] uppercase font-bold">Seller</span>
                                    <span className="font-bold text-orange-400 truncate">@{d.seller?.username || 'user'}</span>
                                </div>
                            </div>

                            <div className="mb-2 px-1">
                                <p className="text-[11px] text-gray-400 leading-tight line-clamp-2 italic">
                                    "{d.dispute_reason}"
                                </p>
                            </div>

                            <div className="flex gap-2 items-center mb-3">
                                <button
                                    className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded text-[10px] font-bold transition-colors border border-white/10 flex items-center justify-center gap-2"
                                    onClick={() => viewMessages(d.id)}
                                >
                                    💬 {d.chatMessages?.length || 0} MESSAGES
                                </button>
                                <div className="text-right text-[11px] text-orange-500/80 font-mono font-bold px-1">
                                    ₹{d.fiat_amount?.toLocaleString()}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    className="flex-1 py-2 rounded-lg bg-green-600/20 hover:bg-green-600/30 text-green-400 text-[10px] font-bold border border-green-600/30 transition-all active:scale-95"
                                    onClick={() => resolve(d.id, true)}
                                    disabled={actionLoading}
                                >
                                    RELEASE
                                </button>
                                <button
                                    className="flex-1 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 text-[10px] font-bold border border-red-600/30 transition-all active:scale-95"
                                    onClick={() => resolve(d.id, false)}
                                    disabled={actionLoading}
                                >
                                    REFUND
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
