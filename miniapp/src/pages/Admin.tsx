
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
            <header className="page-header flex justify-between items-center">
                <div>
                    <h1 className="page-title" style={{ color: 'var(--red)' }}>🛡️ Admin Dashboard</h1>
                    <p className="page-subtitle">Dispute Resolution <span style={{ fontSize: '9px', opacity: 0.3, fontFamily: 'monospace' }}>v1.3.1</span></p>
                </div>
                <button 
                  onClick={() => { haptic('medium'); window.location.reload(); }}
                  className="btn btn-sm btn-secondary"
                  style={{ fontSize: '8px', opacity: 0.6 }}
                >
                  FORCE RELOAD
                </button>
            </header>

            {error && <div className="card mb-4" style={{ backgroundColor: 'var(--red-bg)', borderColor: 'rgba(246, 70, 93, 0.2)', color: 'var(--red)' }}>{error}</div>}

            {disputes.length === 0 ? (
                <div className="empty-state">
                    <div className="icon">🕊️</div>
                    <h3 className="text-secondary">No active disputes</h3>
                    <p className="text-muted">Everything is running smoothly.</p>
                </div>
            ) : (
                <div className="flex-col" style={{ gap: '16px' }}>
                    {disputes.map(d => (
                        <div key={d.id} className="card flex-col" style={{ gap: '12px' }}>
                            {/* Header */}
                            <div className="flex justify-between items-start" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                                <div>
                                    <div className="flex items-center" style={{ gap: '8px', marginBottom: '4px' }}>
                                        <span className="badge badge-red font-mono" style={{ textTransform: 'lowercase' }}>#{d.id.slice(0, 8)}</span>
                                        <span className="font-bold" style={{ fontSize: '0.875rem', color: '#fff' }}>{d.amount} {d.token}</span>
                                    </div>
                                    <div className="text-muted" style={{ fontSize: '10px' }}>{new Date(d.created_at).toLocaleString()}</div>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold" style={{ fontSize: '11px', color: 'var(--orange)' }}>₹{d.fiat_amount?.toLocaleString()}</div>
                                    <div className="text-muted" style={{ fontSize: '10px' }}>@{d.buyer?.username} vs @{d.seller?.username}</div>
                                </div>
                            </div>

                            {/* Escrow Status Tag */}
                            <div style={{ padding: '8px', backgroundColor: 'var(--orange-bg)', border: '1px solid rgba(240, 185, 11, 0.2)', borderRadius: 'var(--radius-md)' }}>
                                <span className="font-bold" style={{ fontSize: '10px', color: 'var(--orange)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    🔒 SECURE ESCROW: {d.amount} {d.token}
                                </span>
                                <div className="text-muted" style={{ fontSize: '9px', marginTop: '2px', lineHeight: '1.2' }}>
                                    Release → Buyer gets funds | Refund → Seller gets funds
                                </div>
                            </div>

                            {/* Chat Preview (Scrollable Window) */}
                            <div className="flex-col" style={{ gap: '8px' }}>
                                <div className="flex justify-between items-center px-1" style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    <span>Chat History</span>
                                    <span>{d.chatMessages?.length || 0} msgs</span>
                                </div>
                                
                                <div className="custom-scrollbar" style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', height: '140px', overflowY: 'scroll', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {d.chatMessages?.length === 0 ? (
                                        <div className="text-muted" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontStyle: 'italic' }}>
                                            No messages yet.
                                        </div>
                                    ) : (
                                        d.chatMessages?.map((msg: any, idx: number) => {
                                            const isBuyer = msg.sender_role === 'buyer' || msg.user_id === d.buyer?.username;
                                            const isAdmin = msg.sender_role === 'admin' || user?.admin_ids?.includes(msg.telegram_id);
                                            const isMe = msg.telegram_id === user.telegram_id;
                                            
                                            return (
                                                <div key={idx} className="flex-col" style={{ maxWidth: '85%', alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                                                    <div style={{ fontSize: '8px', fontWeight: 'bold', marginBottom: '2px', padding: '0 2px', color: isAdmin ? (isMe ? 'var(--blue)' : '#a78bfa') : (isBuyer ? 'var(--green)' : 'var(--orange)') }}>
                                                        {isAdmin ? (isMe ? '🛡️ Admin' : `🛡️ Admin (${msg.first_name || 'Staff'})`) : (msg.first_name || msg.username || (isBuyer ? 'Buyer' : 'Seller'))}
                                                    </div>
                                                    <div className="bubble-shadow" style={{ 
                                                        padding: '8px', 
                                                        borderRadius: 'var(--radius-md)', 
                                                        fontSize: '12px', 
                                                        lineHeight: '1.3',
                                                        backgroundColor: isMe ? 'var(--blue)' : (isAdmin ? 'rgba(88, 28, 135, 0.4)' : 'rgba(255,255,255,0.05)'),
                                                        color: isMe ? '#fff' : 'var(--text-primary)',
                                                        border: isMe ? 'none' : '1px solid var(--border)',
                                                        borderTopRightRadius: isMe ? '0' : 'var(--radius-md)',
                                                        borderTopLeftRadius: !isMe ? '0' : 'var(--radius-md)'
                                                    }}>
                                                        {msg.image_url ? (
                                                            <div className="flex-col" style={{ gap: '4px' }}>
                                                                <img src={msg.image_url} alt="Proof" style={{ maxWidth: '140px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }} />
                                                                {msg.message && <p>{msg.message}</p>}
                                                            </div>
                                                        ) : (
                                                            <p style={{ whiteSpace: 'pre-wrap' }}>{msg.message}</p>
                                                        )}
                                                        <div style={{ fontSize: '7px', opacity: 0.5, textAlign: 'right', marginTop: '4px' }}>
                                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={el => chatEndRefs.current[d.id] = el} />
                                </div>

                                {/* Reply Input Area */}
                                <div className="flex" style={{ gap: '8px' }}>
                                    <input
                                        type="text"
                                        style={{ 
                                            flex: 1, 
                                            padding: '8px 12px', 
                                            fontSize: '12px', 
                                            backgroundColor: 'rgba(0,0,0,0.4)',
                                            border: '1px solid var(--border)',
                                            borderRadius: 'var(--radius-md)',
                                            color: '#fff'
                                        }}
                                        placeholder="Reply traders..."
                                        value={newMessages[d.id] || ''}
                                        onChange={(e) => setNewMessages(prev => ({ ...prev, [d.id]: e.target.value }))}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(d.id)}
                                        disabled={sendingMessage[d.id]}
                                    />
                                    <button
                                        className="btn btn-primary btn-sm"
                                        style={{ padding: '0 16px', opacity: sendingMessage[d.id] || !(newMessages[d.id]?.trim()) ? 0.4 : 1 }}
                                        onClick={() => handleSendMessage(d.id)}
                                        disabled={sendingMessage[d.id] || !(newMessages[d.id]?.trim())}
                                    >
                                        {sendingMessage[d.id] ? <div className="spinner" style={{ width: 12, height: 12 }} /> : 'SEND'}
                                    </button>
                                </div>
                            </div>

                            {/* Resolution Controls */}
                            <div className="flex" style={{ gap: '8px', paddingTop: '4px' }}>
                                <button
                                    className="btn btn-block btn-sm"
                                    style={{ backgroundColor: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-border)', flex: 1 }}
                                    onClick={() => resolve(d.id, true)}
                                    disabled={actionLoading}
                                >
                                    <span className="flex-col items-center">
                                        <span className="font-bold">RELEASE</span>
                                        <span style={{ fontSize: '8px', opacity: 0.7 }}>To Buyer</span>
                                    </span>
                                </button>
                                <button
                                    className="btn btn-block btn-sm"
                                    style={{ backgroundColor: 'var(--red-bg)', color: 'var(--red)', border: '1px solid rgba(246, 70, 93, 0.2)', flex: 1 }}
                                    onClick={() => resolve(d.id, false)}
                                    disabled={actionLoading}
                                >
                                    <span className="flex-col items-center">
                                        <span className="font-bold">REFUND</span>
                                        <span style={{ fontSize: '8px', opacity: 0.7 }}>To Seller</span>
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
