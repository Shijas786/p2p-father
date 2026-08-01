import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { haptic, isTelegramEnvironment } from '../lib/telegram';
import {
    DEMO_ADMIN_DISPUTES,
    DEMO_ADMIN_STATS,
    DEMO_ADMIN_USERS,
    DEMO_ADMIN_TRADES,
} from '../lib/devMocks';
import './Admin.css';

type AdminTab = 'disputes' | 'stats' | 'users' | 'trades';

interface Dispute {
    id: string;
    amount: string;
    token: string;
    fiat_amount: number;
    dispute_reason: string;
    buyer: { username: string; first_name: string; trust_score?: number };
    seller: { username: string; first_name: string; upi_id?: string; phone_number?: string; trust_score?: number };
    payment_proofs?: { utr: string }[];
    created_at: string;
    chatMessages?: any[];
}

interface Props { user: any; }

const STATUS_LABELS: Record<string, string> = {
    completed: 'Done', in_escrow: 'Escrow', fiat_sent: 'Fiat Sent',
    fiat_confirmed: 'Confirmed', waiting_for_escrow: 'Waiting', disputed: 'Disputed', cancelled: 'Cancelled',
};

const TRADE_FILTERS = [
    { key: 'all',                label: 'All' },
    { key: 'in_escrow',         label: 'Active' },
    { key: 'fiat_sent',         label: 'Fiat Sent' },
    { key: 'completed',         label: 'Completed' },
    { key: 'disputed',          label: 'Disputed' },
    { key: 'cancelled',         label: 'Cancelled' },
];

function levelBadge(n: number): string {
    if (n >= 5) return 'badge-lv5';
    if (n >= 4) return 'badge-lv4';
    if (n >= 3) return 'badge-lv3';
    if (n >= 2) return 'badge-lv2';
    return 'badge-lv1';
}

function levelLabel(n: number): string {
    const labels = ['Starter', 'Trader', 'Pro', 'Expert', 'Elite'];
    return labels[Math.min(n - 1, 4)] || 'Starter';
}

export function Admin({ user }: Props) {
    const [activeTab, setActiveTab] = useState<AdminTab>('disputes');

    // ── Disputes ──
    const [disputes, setDisputes]           = useState<Dispute[]>([]);
    const [disputesLoading, setDisputesLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError]                 = useState('');
    const [newMessages, setNewMessages]     = useState<Record<string, string>>({});
    const [sendingMsg, setSendingMsg]       = useState<Record<string, boolean>>({});
    const chatEndRefs = useRef<Record<string, HTMLDivElement | null>>({});

    // ── Stats ──
    const [stats, setStats]               = useState<any>(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsLoaded, setStatsLoaded]   = useState(false);
    const [lastRefresh, setLastRefresh]   = useState<Date | null>(null);

    // ── Users ──
    const [users, setUsers]               = useState<any[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [usersLoaded, setUsersLoaded]   = useState(false);
    const [userSearch, setUserSearch]     = useState('');
    const [expandedUser, setExpandedUser] = useState<string | null>(null);
    const [userProfiles, setUserProfiles] = useState<Record<string, any>>({});
    const [profileLoading, setProfileLoading] = useState<Record<string, boolean>>({});
    const [banningUser, setBanningUser] = useState<Record<string, boolean>>({});

    async function handleToggleBanUser(userId: string) {
        setBanningUser(prev => ({ ...prev, [userId]: true }));
        try {
            const res = await api.admin.toggleBanUser(userId);
            haptic('warning');
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_banned: res.is_banned } : u));
        } catch (err: any) {
            alert('Failed to update ban status: ' + err.message);
        } finally {
            setBanningUser(prev => ({ ...prev, [userId]: false }));
        }
    }

    // ── Trades ──
    const [trades, setTrades]             = useState<any[]>([]);
    const [tradesLoading, setTradesLoading] = useState(false);
    const [tradesLoaded, setTradesLoaded] = useState(false);
    const [tradesStatus, setTradesStatus] = useState('all');
    const [tradesPage, setTradesPage]     = useState(1);
    const [tradesTotal, setTradesTotal]   = useState(0);
    const [expandedTrade, setExpandedTrade] = useState<string | null>(null);

    // Load live trades & disputes on mount and auto-refresh every 10s
    useEffect(() => {
        loadDisputes();
        const interval = setInterval(loadDisputes, 10_000);
        return () => clearInterval(interval);
    }, []);

    // Lazy load other tabs
    useEffect(() => {
        if (activeTab === 'stats' && !statsLoaded) loadStats();
        if (activeTab === 'users' && !usersLoaded) loadUsers();
        if (activeTab === 'trades' && !tradesLoaded) loadTrades(tradesStatus, 1);
    }, [activeTab]);

    // Stats auto-refresh every 30s while on stats tab
    useEffect(() => {
        if (activeTab !== 'stats') return;
        const interval = setInterval(loadStats, 30_000);
        return () => clearInterval(interval);
    }, [activeTab]);

    // Trades auto-refresh every 10s while on trades tab
    useEffect(() => {
        if (activeTab !== 'trades') return;
        const interval = setInterval(() => loadTrades(tradesStatus, tradesPage), 10_000);
        return () => clearInterval(interval);
    }, [activeTab, tradesStatus, tradesPage]);

    // Auto-scroll dispute chats
    useEffect(() => {
        disputes.forEach(d => {
            chatEndRefs.current[d.id]?.scrollIntoView({ behavior: 'smooth' });
        });
    }, [disputes]);

    // ── Loaders ──
    async function loadDisputes() {
        setDisputesLoading(true);
        try {
            if (!isTelegramEnvironment()) {
                // Dev mode: use mock disputes
                await new Promise(r => setTimeout(r, 400));
                setDisputes(DEMO_ADMIN_DISPUTES as any);
                setDisputesLoading(false);
                return;
            }
            const { disputes: loaded } = await api.admin.getDisputes();
            const list = loaded || [];
            const withChats = await Promise.all(
                list.map(async (d: Dispute) => {
                    try {
                        const { messages } = await api.admin.getTradeMessages(d.id);
                        return { ...d, chatMessages: messages || [] };
                    } catch { return { ...d, chatMessages: [] }; }
                })
            );
            setDisputes(withChats);
        } catch (err: any) {
            setError(err.message || 'Failed to load disputes');
        } finally {
            setDisputesLoading(false);
        }
    }

    async function loadStats() {
        setStatsLoading(true);
        try {
            if (!isTelegramEnvironment()) {
                await new Promise(r => setTimeout(r, 300));
                setStats(DEMO_ADMIN_STATS);
                setStatsLoaded(true);
                setLastRefresh(new Date());
                setStatsLoading(false);
                return;
            }
            const data = await api.admin.getStats();
            setStats(data);
            setStatsLoaded(true);
            setLastRefresh(new Date());
        } catch (err: any) {
            console.error('Stats error:', err);
        } finally {
            setStatsLoading(false);
        }
    }

    async function loadUsers() {
        setUsersLoading(true);
        try {
            if (!isTelegramEnvironment()) {
                await new Promise(r => setTimeout(r, 300));
                setUsers(DEMO_ADMIN_USERS);
                setUsersLoaded(true);
                setUsersLoading(false);
                return;
            }
            const { users: list } = await api.users.list();
            setUsers(list || []);
            setUsersLoaded(true);
        } catch (err: any) {
            console.error('Users error:', err);
        } finally {
            setUsersLoading(false);
        }
    }

    async function loadTrades(status: string, page: number) {
        setTradesLoading(true);
        try {
            if (!isTelegramEnvironment()) {
                await new Promise(r => setTimeout(r, 300));
                const filtered = status === 'all'
                    ? DEMO_ADMIN_TRADES
                    : DEMO_ADMIN_TRADES.filter(t => t.status === status);
                setTrades(filtered as any);
                setTradesTotal(filtered.length);
                setTradesLoaded(true);
                setTradesLoading(false);
                return;
            }
            const data = await api.admin.getTrades(status, page);
            setTrades(data.trades || []);
            setTradesTotal(data.total || 0);
            setTradesLoaded(true);
        } catch (err: any) {
            console.error('Trades error:', err);
        } finally {
            setTradesLoading(false);
        }
    }

    function switchTradesFilter(s: string) {
        setTradesStatus(s);
        setTradesPage(1);
        setExpandedTrade(null);
        loadTrades(s, 1);
    }

    function switchTradesPage(p: number) {
        setTradesPage(p);
        loadTrades(tradesStatus, p);
    }

    async function expandUser(uid: string) {
        if (expandedUser === uid) { setExpandedUser(null); return; }
        setExpandedUser(uid);
        if (userProfiles[uid]) return;
        setProfileLoading(prev => ({ ...prev, [uid]: true }));
        try {
            const data = await api.users.getProfile(uid);
            setUserProfiles(prev => ({ ...prev, [uid]: data }));
        } catch { /* ignore */ } finally {
            setProfileLoading(prev => ({ ...prev, [uid]: false }));
        }
    }

    // ── Dispute Actions ──
    async function handleSendMessage(tradeId: string) {
        const msg = newMessages[tradeId];
        if (!msg?.trim()) return;
        setSendingMsg(prev => ({ ...prev, [tradeId]: true }));
        try {
            await api.admin.sendMessage(tradeId, msg.trim());
            setNewMessages(prev => ({ ...prev, [tradeId]: '' }));
            haptic('light');
            const { messages } = await api.admin.getTradeMessages(tradeId);
            setDisputes(prev => prev.map(d => d.id === tradeId ? { ...d, chatMessages: messages } : d));
            setTimeout(() => { chatEndRefs.current[tradeId]?.scrollIntoView({ behavior: 'smooth' }); }, 100);
        } catch (err: any) {
            alert('Failed to send message: ' + err.message);
        } finally {
            setSendingMsg(prev => ({ ...prev, [tradeId]: false }));
        }
    }

    async function resolve(tradeId: string, releaseToBuyer: boolean) {
        const action = releaseToBuyer ? 'RELEASE to Buyer' : 'REFUND to Seller';
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

    // ── Filtered users list ──
    const filteredUsers = users.filter(u => {
        if (!userSearch.trim()) return true;
        const q = userSearch.toLowerCase();
        return (u.username || '').toLowerCase().includes(q)
            || (u.first_name || '').toLowerCase().includes(q);
    });

    // ── Renders ──
    function renderTabBar() {
        return (
            <div className="admin-tab-bar">
                {([
                    { key: 'disputes', icon: '⚡', label: 'Live Trades', badge: disputes.length },
                    { key: 'stats',    icon: '📊', label: 'Stats',    badge: 0 },
                    { key: 'users',    icon: '👤', label: 'Users',    badge: 0 },
                    { key: 'trades',   icon: '📋', label: 'Trades',   badge: 0 },
                ] as const).map(t => (
                    <button
                        key={t.key}
                        className={`admin-tab${activeTab === t.key ? ' active' : ''}`}
                        onClick={() => setActiveTab(t.key)}
                    >
                        {t.badge > 0 && <span className="admin-tab-badge">{t.badge}</span>}
                        <span>{t.icon}</span>
                        <span className="tab-label">{t.label}</span>
                    </button>
                ))}
            </div>
        );
    }

    function renderDisputes() {
        if (disputesLoading) return (
            <div className="admin-tab-content">
                <div className="skeleton" style={{ height: 120 }} />
                <div className="skeleton" style={{ height: 120 }} />
            </div>
        );
        return (
            <div className="admin-tab-content">
                {error && (
                    <div className="card" style={{ background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13 }}>{error}</div>
                )}
                {disputes.length === 0 ? (
                    <div className="admin-empty">
                        <div className="admin-empty-icon">🕊️</div>
                        No active disputes
                    </div>
                ) : disputes.map(d => (
                    <div key={d.id} className="card flex-col" style={{ gap: 12 }}>
                        {/* Header */}
                        <div className="flex justify-between items-start" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                            <div>
                                <div className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
                                    <span className="badge badge-red font-mono" style={{ textTransform: 'lowercase' }}>#{d.id.slice(0, 8)}</span>
                                    <span className="font-bold" style={{ fontSize: '0.875rem', color: '#fff' }}>{d.amount} {d.token}</span>
                                </div>
                                <div className="text-muted" style={{ fontSize: 10 }}>{new Date(d.created_at).toLocaleString()}</div>
                            </div>
                            <div className="text-right flex-col items-end">
                                <div className="font-bold" style={{ fontSize: 12, color: 'var(--orange)' }}>₹{d.fiat_amount?.toLocaleString()}</div>
                                <div className="flex-col items-end" style={{ gap: 2, marginTop: 4 }}>
                                    <div className="flex items-center" style={{ gap: 4, fontSize: 10 }}>
                                        <span style={{ color: 'var(--green)', fontWeight: 'bold' }}>BUYER:</span>
                                        <span style={{ color: '#fff' }}>@{d.buyer?.username || 'user'}</span>
                                        {d.buyer?.trust_score !== undefined && <span style={{ opacity: 0.5, fontSize: 8 }}>({d.buyer.trust_score}⭐)</span>}
                                    </div>
                                    <div className="flex items-center" style={{ gap: 4, fontSize: 10 }}>
                                        <span style={{ color: 'var(--orange)', fontWeight: 'bold' }}>SELLER:</span>
                                        <span style={{ color: '#fff' }}>@{d.seller?.username || 'user'}</span>
                                        {d.seller?.trust_score !== undefined && <span style={{ opacity: 0.5, fontSize: 8 }}>({d.seller.trust_score}⭐)</span>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Escrow Status */}
                        <div style={{ padding: 8, backgroundColor: 'var(--orange-bg)', border: '1px solid rgba(240,185,11,0.2)', borderRadius: 'var(--radius-md)' }}>
                            <span className="font-bold" style={{ fontSize: 10, color: 'var(--orange)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                🔒 SECURE ESCROW: {d.amount} {d.token}
                            </span>
                            <div className="text-muted" style={{ fontSize: 9, marginTop: 2, lineHeight: 1.2 }}>
                                Release → Buyer gets funds | Refund → Seller gets funds
                            </div>
                        </div>

                        {/* Dispute Reason */}
                        <div className="flex-col" style={{ gap: 8, padding: 10, backgroundColor: 'rgba(246,70,93,0.05)', border: '1px solid rgba(246,70,93,0.1)', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🚩 Dispute Reason</div>
                            <div style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text-primary)' }}>{d.dispute_reason}</div>
                            <div className="flex flex-wrap" style={{ gap: 12, marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
                                {d.payment_proofs?.[0]?.utr && (
                                    <div className="flex-col">
                                        <span style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 'bold' }}>UTR / REF NO</span>
                                        <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--blue)' }}>{d.payment_proofs[0].utr}</span>
                                    </div>
                                )}
                                {d.seller?.upi_id && (
                                    <div className="flex-col">
                                        <span style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 'bold' }}>SELLER UPI</span>
                                        <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--green)' }}>{d.seller.upi_id}</span>
                                    </div>
                                )}
                                {d.seller?.phone_number && (
                                    <div className="flex-col">
                                        <span style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 'bold' }}>SELLER CONTACT</span>
                                        <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>{d.seller.phone_number}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Chat */}
                        <div className="flex-col" style={{ gap: 8 }}>
                            <div className="flex justify-between items-center px-1" style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <span>Chat History</span>
                                <span>{d.chatMessages?.length || 0} msgs</span>
                            </div>
                            <div className="custom-scrollbar" style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', height: 140, overflowY: 'scroll', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {d.chatMessages?.length === 0 ? (
                                    <div className="text-muted" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontStyle: 'italic' }}>No messages yet.</div>
                                ) : d.chatMessages?.map((msg: any, idx: number) => {
                                    const isBuyer = msg.sender_role === 'buyer';
                                    const isAdmin = msg.sender_role === 'admin' || user?.admin_ids?.includes(msg.telegram_id);
                                    const isMe = msg.telegram_id === user.telegram_id;

                                    // Find latest response from anyone other than sender of this message
                                    const senderId = msg.telegram_id || msg.user_id;
                                    const latestOtherTs = (d.chatMessages || [])
                                        .filter((m: any) => (m.telegram_id || m.user_id) !== senderId)
                                        .reduce((latest: string, m: any) => (m.created_at > latest ? m.created_at : latest), '');

                                    const isSeen = latestOtherTs && msg.created_at <= latestOtherTs;

                                    return (
                                        <div key={idx} className="flex-col" style={{ maxWidth: '85%', alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                                            <div style={{ fontSize: 8, fontWeight: 'bold', marginBottom: 2, padding: '0 2px', color: isAdmin ? (isMe ? 'var(--blue)' : '#a78bfa') : (isBuyer ? 'var(--green)' : 'var(--orange)') }}>
                                                {isAdmin ? (isMe ? '🛡️ Admin' : `🛡️ Admin (${msg.first_name || 'Staff'})`) : (msg.first_name || msg.username || (isBuyer ? 'Buyer' : 'Seller'))}
                                            </div>
                                            <div style={{ padding: 8, borderRadius: 'var(--radius-md)', fontSize: 12, lineHeight: 1.3, backgroundColor: isMe ? 'var(--blue)' : (isAdmin ? 'rgba(88,28,135,0.4)' : 'rgba(255,255,255,0.05)'), color: isMe ? '#fff' : 'var(--text-primary)', border: isMe ? 'none' : '1px solid var(--border)', borderTopRightRadius: isMe ? 0 : 'var(--radius-md)', borderTopLeftRadius: !isMe ? 0 : 'var(--radius-md)' }}>
                                                {msg.image_url ? (
                                                    <div className="flex-col" style={{ gap: 4 }}>
                                                        <img src={msg.image_url} alt="Proof" style={{ maxWidth: 140, borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }} />
                                                        {msg.message && <p>{msg.message}</p>}
                                                    </div>
                                                ) : (
                                                    <p style={{ whiteSpace: 'pre-wrap' }}>{msg.message}</p>
                                                )}
                                                <div style={{ fontSize: 7, opacity: 0.7, textAlign: 'right', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                                                    <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    <span style={{ color: isSeen ? '#0ecb81' : 'rgba(255,255,255,0.35)', fontWeight: 'bold', letterSpacing: '-1px' }}>
                                                        {isSeen ? ' ✓✓' : ' ✓'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={el => { chatEndRefs.current[d.id] = el; }} />
                            </div>
                            <div className="flex" style={{ gap: 8 }}>
                                <input
                                    type="text"
                                    style={{ flex: 1, padding: '8px 12px', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: '#fff' }}
                                    placeholder="Reply to traders..."
                                    value={newMessages[d.id] || ''}
                                    onChange={e => setNewMessages(prev => ({ ...prev, [d.id]: e.target.value }))}
                                    onKeyDown={e => e.key === 'Enter' && handleSendMessage(d.id)}
                                    disabled={sendingMsg[d.id]}
                                />
                                <button
                                    className="btn btn-primary btn-sm"
                                    style={{ padding: '0 16px', opacity: sendingMsg[d.id] || !(newMessages[d.id]?.trim()) ? 0.4 : 1 }}
                                    onClick={() => handleSendMessage(d.id)}
                                    disabled={sendingMsg[d.id] || !(newMessages[d.id]?.trim())}
                                >
                                    {sendingMsg[d.id] ? <div className="spinner" style={{ width: 12, height: 12 }} /> : 'SEND'}
                                </button>
                            </div>
                        </div>

                        {/* Resolution */}
                        <div className="flex" style={{ gap: 8, paddingTop: 4 }}>
                            <button className="btn btn-block btn-sm" style={{ backgroundColor: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-border)', flex: 1 }} onClick={() => resolve(d.id, true)} disabled={actionLoading}>
                                <span className="flex-col items-center"><span className="font-bold">RELEASE</span><span style={{ fontSize: 8, opacity: 0.7 }}>To Buyer</span></span>
                            </button>
                            <button className="btn btn-block btn-sm" style={{ backgroundColor: 'var(--red-bg)', color: 'var(--red)', border: '1px solid rgba(246,70,93,0.2)', flex: 1 }} onClick={() => resolve(d.id, false)} disabled={actionLoading}>
                                <span className="flex-col items-center"><span className="font-bold">REFUND</span><span style={{ fontSize: 8, opacity: 0.7 }}>To Seller</span></span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    function renderStats() {
        const fmtNum  = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? '—');
        const fmtVol  = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${(n || 0).toFixed(0)}`;
        return (
            <div className="admin-tab-content">
                <div className="admin-stat-refresh">
                    <div className="admin-live-dot" />
                    {lastRefresh ? `Refreshed ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Loading...'}
                </div>
                {statsLoading && !stats ? (
                    <div className="admin-stat-grid">
                        {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 14 }} />)}
                    </div>
                ) : stats ? (
                    <div className="admin-stat-grid">
                        <div className="admin-stat-card green">
                            <div className="admin-stat-icon">👥</div>
                            <div className="admin-stat-value">{fmtNum(stats.total_users)}</div>
                            <div className="admin-stat-label">Total Users</div>
                        </div>
                        <div className="admin-stat-card blue">
                            <div className="admin-stat-icon">🔥</div>
                            <div className="admin-stat-value">{fmtNum(stats.active_trades)}</div>
                            <div className="admin-stat-label">Active Trades</div>
                        </div>
                        <div className="admin-stat-card teal">
                            <div className="admin-stat-icon">✅</div>
                            <div className="admin-stat-value">{fmtNum(stats.completed_trades)}</div>
                            <div className="admin-stat-label">Completed</div>
                        </div>
                        <div className="admin-stat-card red">
                            <div className="admin-stat-icon">⚠️</div>
                            <div className="admin-stat-value">{fmtNum(stats.active_disputes)}</div>
                            <div className="admin-stat-label">Disputes</div>
                        </div>
                        <div className="admin-stat-card orange">
                            <div className="admin-stat-icon">💰</div>
                            <div className="admin-stat-value">{fmtVol(stats.total_volume)}</div>
                            <div className="admin-stat-label">Total Volume</div>
                        </div>
                        <div className="admin-stat-card purple">
                            <div className="admin-stat-icon">💎</div>
                            <div className="admin-stat-value">{fmtVol(stats.volume_today)}</div>
                            <div className="admin-stat-label">Volume Today</div>
                        </div>
                    </div>
                ) : (
                    <div className="admin-empty"><div className="admin-empty-icon">📊</div>Failed to load stats</div>
                )}
            </div>
        );
    }

    function renderUsers() {
        return (
            <div className="admin-tab-content">
                <input
                    className="admin-search"
                    placeholder="🔍  Search by username or name..."
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                />
                {usersLoading ? (
                    <>{[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 58, borderRadius: 12 }} />)}</>
                ) : filteredUsers.length === 0 ? (
                    <div className="admin-empty"><div className="admin-empty-icon">🔍</div>No users found</div>
                ) : filteredUsers.map(u => {
                    const isExpanded = expandedUser === u.id;
                    const profile    = userProfiles[u.id];
                    const lvl        = profile?.level ?? 1;
                    return (
                        <div key={u.id} className={`admin-user-card${isExpanded ? ' expanded' : ''}`}>
                            <div className="admin-user-header" onClick={() => expandUser(u.id)}>
                                <div className="admin-user-avatar">
                                    {u.photo_url
                                        ? <img src={u.photo_url} alt="" onError={e => (e.currentTarget.style.display = 'none')} />
                                        : (u.first_name?.[0] || u.username?.[0] || '?').toUpperCase()
                                    }
                                </div>
                                <div className="admin-user-info">
                                    <div className="admin-user-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span>@{u.username || u.first_name || 'Unknown'}</span>
                                        {u.is_banned && (
                                            <span style={{ fontSize: 9, backgroundColor: '#f6465d', color: '#fff', padding: '1px 5px', borderRadius: 4, fontWeight: 'bold' }}>
                                                ⛔ BANNED
                                            </span>
                                        )}
                                    </div>
                                    <div className="admin-user-sub">{u.completed_trades || 0} trades</div>
                                </div>
                                <span className={`admin-user-badge ${levelBadge(lvl)}`}>{levelLabel(lvl)}</span>
                            </div>
                            {isExpanded && (
                                <div className="admin-user-detail">
                                    {profileLoading[u.id] ? (
                                        <div className="skeleton" style={{ height: 60, borderRadius: 8, marginTop: 10 }} />
                                    ) : profile ? (
                                        <div className="admin-user-stats-row">
                                            <div className="admin-user-stat">
                                                <div className="admin-user-stat-val">{profile.completed_trades ?? 0}</div>
                                                <div className="admin-user-stat-lbl">Trades</div>
                                            </div>
                                            <div className="admin-user-stat">
                                                <div className="admin-user-stat-val">${(profile.total_volume || 0).toFixed(0)}</div>
                                                <div className="admin-user-stat-lbl">Volume</div>
                                            </div>
                                            <div className="admin-user-stat">
                                                <div className="admin-user-stat-val">{profile.completion_rate ?? 0}%</div>
                                                <div className="admin-user-stat-lbl">Completion</div>
                                            </div>
                                            <div className="admin-user-stat">
                                                <div className="admin-user-stat-val">{profile.buy_count ?? 0}</div>
                                                <div className="admin-user-stat-lbl">Buys</div>
                                            </div>
                                            <div className="admin-user-stat">
                                                <div className="admin-user-stat-val">{profile.sell_count ?? 0}</div>
                                                <div className="admin-user-stat-lbl">Sells</div>
                                            </div>
                                            <div className="admin-user-stat">
                                                <div className="admin-user-stat-val">Lv{profile.level ?? 1}</div>
                                                <div className="admin-user-stat-lbl">Level</div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ paddingTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>Could not load profile</div>
                                    )}
                                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                                        <button
                                            style={{
                                                backgroundColor: u.is_banned ? 'rgba(16, 185, 129, 0.15)' : 'rgba(246, 70, 93, 0.15)',
                                                color: u.is_banned ? '#10b981' : '#f6465d',
                                                border: u.is_banned ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(246, 70, 93, 0.4)',
                                                padding: '6px 14px',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                                borderRadius: '6px',
                                                cursor: 'pointer'
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleToggleBanUser(u.id);
                                            }}
                                            disabled={banningUser[u.id]}
                                        >
                                            {banningUser[u.id] ? 'Updating...' : u.is_banned ? '✅ UNBLOCK USER' : '⛔ BLOCK USER'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
                    {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
                </div>
            </div>
        );
    }

    function renderTrades() {
        const totalPages = Math.ceil(tradesTotal / 25);
        return (
            <div className="admin-tab-content">
                <div className="admin-status-pills">
                    {TRADE_FILTERS.map(f => (
                        <button
                            key={f.key}
                            className={`admin-status-pill${tradesStatus === f.key ? ' active' : ''}`}
                            onClick={() => switchTradesFilter(f.key)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {tradesLoading ? (
                    <>{[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 12 }} />)}</>
                ) : trades.length === 0 ? (
                    <div className="admin-empty"><div className="admin-empty-icon">📋</div>No trades found</div>
                ) : (
                    <>
                        {trades.map(t => {
                            const isExpanded = expandedTrade === t.id;
                            const statusKey  = (t.status || '').toLowerCase().replace(/\s+/g, '_');
                            return (
                                <div key={t.id} className={`admin-trade-card${isExpanded ? ' expanded' : ''}`}>
                                    <div className="admin-trade-header" onClick={() => setExpandedTrade(isExpanded ? null : t.id)}>
                                        <div className="admin-trade-amount">
                                            <div className="admin-trade-amt-main">{parseFloat(t.amount || 0).toFixed(2)} {t.token}</div>
                                            <div className="admin-trade-amt-sub">
                                                @{t.buyer?.username || '?'} → @{t.seller?.username || '?'} · {new Date(t.created_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <span className={`admin-trade-status-badge status-${statusKey}`}>
                                            {STATUS_LABELS[statusKey] || t.status}
                                        </span>
                                    </div>
                                    {isExpanded && (
                                        <div className="admin-trade-detail">
                                            <div className="admin-trade-meta">
                                                <div className="admin-trade-meta-row">
                                                    <span className="admin-trade-meta-label">Trade ID</span>
                                                    <span className="admin-trade-meta-value">#{t.id.slice(0, 12)}…</span>
                                                </div>
                                                <div className="admin-trade-meta-row">
                                                    <span className="admin-trade-meta-label">Chain</span>
                                                    <span className="admin-trade-meta-value">{t.chain || '—'}</span>
                                                </div>
                                                <div className="admin-trade-meta-row">
                                                    <span className="admin-trade-meta-label">Fiat</span>
                                                    <span className="admin-trade-meta-value">₹{(t.fiat_amount || 0).toLocaleString()}</span>
                                                </div>
                                                <div className="admin-trade-meta-row">
                                                    <span className="admin-trade-meta-label">Rate</span>
                                                    <span className="admin-trade-meta-value">₹{(t.rate || 0).toLocaleString()}</span>
                                                </div>
                                                <div className="admin-trade-meta-row">
                                                    <span className="admin-trade-meta-label">Date</span>
                                                    <span className="admin-trade-meta-value">{new Date(t.created_at).toLocaleString()}</span>
                                                </div>
                                                {t.on_chain_trade_id && (
                                                    <div className="admin-trade-meta-row">
                                                        <span className="admin-trade-meta-label">On-Chain ID</span>
                                                        <span className="admin-trade-meta-value">#{t.on_chain_trade_id}</span>
                                                    </div>
                                                )}
                                                {t.release_tx_hash && t.release_tx_hash.startsWith('0x') && (
                                                    <div className="admin-trade-meta-row">
                                                        <span className="admin-trade-meta-label">Release Tx</span>
                                                        <a 
                                                            href={t.chain === 'base' ? `https://basescan.org/tx/${t.release_tx_hash}` : `https://bscscan.com/tx/${t.release_tx_hash}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="admin-trade-meta-value"
                                                            style={{ color: '#60a5fa', textDecoration: 'underline' }}
                                                        >
                                                            View on {t.chain === 'base' ? 'Basescan' : 'BscScan'} ↗
                                                        </a>
                                                    </div>
                                                )}
                                                {t.escrow_tx_hash && t.escrow_tx_hash.startsWith('0x') && (
                                                    <div className="admin-trade-meta-row">
                                                        <span className="admin-trade-meta-label">Escrow Tx</span>
                                                        <a 
                                                            href={t.chain === 'base' ? `https://basescan.org/tx/${t.escrow_tx_hash}` : `https://bscscan.com/tx/${t.escrow_tx_hash}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="admin-trade-meta-value"
                                                            style={{ color: '#60a5fa', textDecoration: 'underline' }}
                                                        >
                                                            View on {t.chain === 'base' ? 'Basescan' : 'BscScan'} ↗
                                                        </a>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {totalPages > 1 && (
                            <div className="admin-pagination">
                                <button onClick={() => switchTradesPage(tradesPage - 1)} disabled={tradesPage <= 1}>← Prev</button>
                                <span className="admin-pagination-info">Page {tradesPage} / {totalPages}</span>
                                <button onClick={() => switchTradesPage(tradesPage + 1)} disabled={tradesPage >= totalPages}>Next →</button>
                            </div>
                        )}
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
                            {tradesTotal} total trade{tradesTotal !== 1 ? 's' : ''}
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="page admin-page">
            <div className="page-header">
                <h1 className="page-title" style={{ color: 'var(--red)' }}>🛡️ Admin</h1>
                <p className="page-subtitle">Dashboard <span style={{ fontSize: 9, opacity: 0.3, fontFamily: 'monospace' }}>v2.0</span></p>
            </div>
            {renderTabBar()}
            {activeTab === 'disputes' && renderDisputes()}
            {activeTab === 'stats'    && renderStats()}
            {activeTab === 'users'    && renderUsers()}
            {activeTab === 'trades'   && renderTrades()}
        </div>
    );
}
