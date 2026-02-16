import { useState } from 'react';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { IconLock, IconInfo, IconCheck, IconWarning, IconHistory, IconArrowRight } from '../components/Icons';
import { useNavigate } from 'react-router-dom';
import './Profile.css';

interface Props {
    user: any;
    onUpdate: () => void;
    onSwitchWallet: () => void;
}

export function Profile({ user, onUpdate, onSwitchWallet }: Props) {
    const navigate = useNavigate();

    // UPI State
    const [upiInput, setUpiInput] = useState(user?.upi_id || '');
    const [editingUpi, setEditingUpi] = useState(false);

    // Phone State
    const [phoneInput, setPhoneInput] = useState(user?.phone_number || '');
    const [editingPhone, setEditingPhone] = useState(false);

    // Bank State
    const [bankAccount, setBankAccount] = useState(user?.bank_account_number || '');
    const [bankIfsc, setBankIfsc] = useState(user?.bank_ifsc || '');
    const [bankName, setBankName] = useState(user?.bank_name || '');
    const [editingBank, setEditingBank] = useState(false);

    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    async function saveField(updates: Record<string, any>, successMsg: string) {
        haptic('medium');
        setSaving(true);
        setMessage('');
        try {
            await api.profile.update(updates);
            haptic('success');
            setMessage(`success:${successMsg}`);
            setEditingUpi(false);
            setEditingPhone(false);
            setEditingBank(false);
            onUpdate();
        } catch (err: any) {
            setMessage(`error:${err.message}`);
            haptic('error');
        } finally {
            setSaving(false);
        }
    }

    async function saveUpi() {
        if (!upiInput || !upiInput.includes('@')) {
            setMessage('error:Enter a valid UPI ID (e.g. name@upi)');
            return;
        }
        await saveField({ upi_id: upiInput }, 'UPI updated!');
    }

    async function savePhone() {
        const cleaned = phoneInput.replace(/\D/g, '');
        if (cleaned.length < 10) {
            setMessage('error:Enter a valid 10-digit phone number');
            return;
        }
        await saveField({ phone_number: cleaned }, 'Phone updated!');
    }

    async function saveBank() {
        if (!bankAccount || bankAccount.length < 8) {
            setMessage('error:Enter a valid bank account number');
            return;
        }
        if (!bankIfsc || bankIfsc.length < 11) {
            setMessage('error:Enter a valid IFSC code (11 characters)');
            return;
        }
        await saveField({
            bank_account_number: bankAccount,
            bank_ifsc: bankIfsc.toUpperCase(),
            bank_name: bankName || null,
        }, 'Bank details updated!');
    }

    return (
        <div className="page animate-in">
            <div className="page-header">
                <h1 className="page-title">Profile</h1>
            </div>

            {/* User Card */}
            <div className="p-user card-glass glow-green">
                <div className="p-avatar">
                    {user?.first_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="p-user-info">
                    <h2>{user?.first_name || 'User'}</h2>
                    {user?.username && <span className="text-sm text-muted">@{user.username}</span>}
                </div>
                <span className={`badge badge-green`}>
                    {user?.tier?.toUpperCase() || 'STANDARD'}
                </span>
            </div>

            {/* Stats Grid */}
            <div className="p-stats">
                <div className="p-stat">
                    <span className="p-stat-value font-mono">{user?.trust_score || 100}%</span>
                    <span className="label">Trust Score</span>
                </div>
                <div className="p-stat">
                    <span className="p-stat-value font-mono">{user?.completed_trades || 0}</span>
                    <span className="label">Trades</span>
                </div>
                <div className="p-stat">
                    <span className="p-stat-value font-mono">{user?.trade_count || 0}</span>
                    <span className="label">Total</span>
                </div>
                <div className="p-stat">
                    <span className="p-stat-value">
                        {user?.is_verified
                            ? <IconCheck size={20} color="var(--green)" />
                            : <IconWarning size={20} color="var(--red)" />
                        }
                    </span>
                    <span className="label">Verified</span>
                </div>
            </div>

            {/* Order History Quick Link */}
            <div className="p-section card tappable" onClick={() => { haptic('light'); navigate('/my-ads'); }}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-icon-circle bg-blue">
                            <IconHistory size={20} color="var(--blue)" />
                        </div>
                        <div>
                            <h3 className="mb-0">Order History</h3>
                            <p className="text-xs text-muted mb-0">View past deals and activity</p>
                        </div>
                    </div>
                    <IconArrowRight size={20} color="var(--text-muted)" />
                </div>
            </div>

            {/* ═══ PAYMENT METHODS ═══ */}
            <div className="p-section card" style={{ borderLeft: '3px solid var(--green)' }}>
                <h3 className="mb-3" style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--green)' }}>
                    💳 Payment Methods
                </h3>
                <p className="text-xs text-muted mb-3">Set up your payment details. Buyers will see these when paying you.</p>

                {/* UPI Section */}
                <div className="p-payment-block">
                    <div className="flex items-center justify-between mb-2">
                        <span className="p-payment-label">📱 UPI ID</span>
                        {!editingUpi && (
                            <button className="btn btn-xs btn-outline" onClick={() => { haptic('light'); setEditingUpi(true); setMessage(''); }}>
                                {user?.upi_id ? 'Change' : 'Set Up'}
                            </button>
                        )}
                    </div>
                    {editingUpi ? (
                        <div>
                            <input placeholder="yourname@upi" value={upiInput} onChange={e => setUpiInput(e.target.value)} className="mb-2" autoFocus />
                            <div className="flex gap-2">
                                <button className="btn btn-primary flex-1 btn-sm" onClick={saveUpi} disabled={saving}>
                                    {saving ? <span className="spinner" /> : 'Save'}
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => setEditingUpi(false)}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <p className="font-mono text-sm">{user?.upi_id || <span className="text-muted">Not set</span>}</p>
                    )}
                </div>

                {/* Phone Section */}
                <div className="p-payment-block">
                    <div className="flex items-center justify-between mb-2">
                        <span className="p-payment-label">📞 Phone Number</span>
                        {!editingPhone && (
                            <button className="btn btn-xs btn-outline" onClick={() => { haptic('light'); setEditingPhone(true); setMessage(''); }}>
                                {user?.phone_number ? 'Change' : 'Set Up'}
                            </button>
                        )}
                    </div>
                    {editingPhone ? (
                        <div>
                            <input type="tel" placeholder="9876543210" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} className="mb-2" autoFocus />
                            <div className="flex gap-2">
                                <button className="btn btn-primary flex-1 btn-sm" onClick={savePhone} disabled={saving}>
                                    {saving ? <span className="spinner" /> : 'Save'}
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => setEditingPhone(false)}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <p className="font-mono text-sm">{user?.phone_number || <span className="text-muted">Not set</span>}</p>
                    )}
                </div>

                {/* Bank Details Section */}
                <div className="p-payment-block" style={{ borderBottom: 'none' }}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="p-payment-label">🏦 Bank Transfer (IMPS)</span>
                        {!editingBank && (
                            <button className="btn btn-xs btn-outline" onClick={() => { haptic('light'); setEditingBank(true); setMessage(''); }}>
                                {user?.bank_account_number ? 'Change' : 'Set Up'}
                            </button>
                        )}
                    </div>
                    {editingBank ? (
                        <div>
                            <input placeholder="Account Number" value={bankAccount} onChange={e => setBankAccount(e.target.value)} className="mb-2" autoFocus />
                            <input placeholder="IFSC Code (e.g. SBIN0001234)" value={bankIfsc} onChange={e => setBankIfsc(e.target.value.toUpperCase())} className="mb-2" />
                            <input placeholder="Bank Name (optional)" value={bankName} onChange={e => setBankName(e.target.value)} className="mb-2" />
                            <div className="flex gap-2">
                                <button className="btn btn-primary flex-1 btn-sm" onClick={saveBank} disabled={saving}>
                                    {saving ? <span className="spinner" /> : 'Save'}
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => setEditingBank(false)}>Cancel</button>
                            </div>
                        </div>
                    ) : user?.bank_account_number ? (
                        <div className="text-sm">
                            <p className="font-mono mb-1">{user.bank_account_number}</p>
                            <p className="text-muted text-xs">IFSC: <span className="font-mono">{user.bank_ifsc}</span> {user.bank_name && `• ${user.bank_name}`}</p>
                        </div>
                    ) : (
                        <p className="text-sm text-muted">Not set</p>
                    )}
                </div>
            </div>

            {/* Status Message */}
            {message && (
                <div className={`mt-2 text-sm ${message.startsWith('success:') ? 'text-green' : 'text-red'}`} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 16px' }}>
                    {message.startsWith('success:')
                        ? <><IconCheck size={14} color="var(--green)" /> {message.replace('success:', '')}</>
                        : <>{message.replace('error:', '')}</>
                    }
                </div>
            )}

            {/* Wallet Type */}
            <div className="p-section card">
                <div className="flex items-center justify-between mb-2">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <IconLock size={18} /> Wallet Type
                    </h3>
                    <button
                        className="btn btn-sm btn-outline"
                        style={{ color: '#ff4d4d', borderColor: '#ff4d4d33' }}
                        onClick={() => {
                            if (window.confirm('Switch wallet? This will return you to the wallet selection screen.')) {
                                haptic('medium');
                                onSwitchWallet();
                            }
                        }}
                    >
                        Switch
                    </button>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm">
                        {user?.wallet_address
                            ? `${user.wallet_address.slice(0, 8)}...${user.wallet_address.slice(-6)}`
                            : 'No wallet connected'
                        }
                    </span>
                    <span className={`badge ${user?.wallet_type === 'external' ? 'badge-blue' : 'badge-green'} text-xs`}>
                        {user?.wallet_type === 'external' ? 'External Wallet' : 'Bot Wallet'}
                    </span>
                </div>
            </div>

            {/* Account Info */}
            <div className="p-section card">
                <h3 className="mb-2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconInfo size={18} /> Account
                </h3>
                <div className="p-account-rows">
                    <div className="p-account-row">
                        <span className="text-muted">Telegram ID</span>
                        <span className="font-mono text-sm">{user?.telegram_id}</span>
                    </div>
                    <div className="p-account-row">
                        <span className="text-muted">Member Since</span>
                        <span className="text-sm">
                            {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                        </span>
                    </div>
                    <div className="p-account-row">
                        <span className="text-muted">Network</span>
                        <span className="text-sm">Base (Mainnet)</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
