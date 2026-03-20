import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { APP_VERSION } from '../constants';
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

    // Receive Address State
    const [receiveAddrInput, setReceiveAddrInput] = useState(user?.receive_address || '');
    const [editingReceiveAddr, setEditingReceiveAddr] = useState(false);

    // CDM State
    const [cdmBankNumber, setCdmBankNumber] = useState(user?.cdm_bank_number || '');
    const [cdmBankName, setCdmBankName] = useState(user?.cdm_bank_name || '');
    const [cdmPhone, setCdmPhone] = useState(user?.cdm_phone || '');
    const [cdmUserName, setCdmUserName] = useState(user?.cdm_user_name || '');
    const [editingCdm, setEditingCdm] = useState(false);

    // Accordion State
    const [isPaymentMethodsExpanded, setIsPaymentMethodsExpanded] = useState(false);

    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setSaving(true);
            setMessage('');
            await api.users.uploadAvatar(file);
            haptic('success');
            setMessage('success:Avatar updated!');
            onUpdate();
        } catch (err: any) {
            setMessage(`error:${err.message}`);
            haptic('error');
        } finally {
            setSaving(false);
        }
    };

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
            setEditingReceiveAddr(false);
            setEditingCdm(false);
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

    async function saveReceiveAddr() {
        if (receiveAddrInput && !receiveAddrInput.startsWith('0x')) {
            setMessage('error:Enter a valid wallet address (0x...)');
            return;
        }
        await saveField({ receive_address: receiveAddrInput || null }, 'Receive address updated!');
    }

    async function useDefaultWallet() {
        setReceiveAddrInput('');
        await saveField({ receive_address: null }, 'Reset to default wallet!');
    }

    async function saveCdm() {
        if (!cdmBankNumber || !cdmBankName || !cdmPhone || !cdmUserName) {
            setMessage('error:Please fill all CDM fields');
            return;
        }
        await saveField({
            cdm_bank_number: cdmBankNumber,
            cdm_bank_name: cdmBankName,
            cdm_phone: cdmPhone,
            cdm_user_name: cdmUserName
        }, 'CDM details updated!');
    }


    if (!user) {
        return (
            <div className="page flex items-center justify-center">
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div className="page profile-page animate-in">
            {/* ═══ Profile Header ═══ */}
            <div className="prof-header">
                {/* Left side: Avatar */}
                <div className="prof-avatar">
                    {user?.photo_url ? (
                        <img src={user.photo_url} alt="" className="prof-avatar-img" />
                    ) : (
                        <span className="prof-avatar-letter">{user?.first_name?.[0]?.toUpperCase() || '?'}</span>
                    )}
                </div>

                {/* Right side: Info & Actions */}
                <div className="prof-info-col" style={{ flex: 1 }}>
                    <div className="prof-name-row">
                        <h2 className="prof-username">{user?.first_name || 'User'}</h2>
                        {user?.username && <span className="prof-handle">@{user.username}</span>}
                    </div>

                    <div className="prof-badges">
                        <span className="prof-badge verified">✓ Telegram Verified</span>
                    </div>

                    {/* Hidden File Input & Update Button */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*"
                        style={{ display: 'none' }}
                    />
                    <button className="prof-update-photo-btn" style={{ marginTop: '12px', width: 'fit-content' }} onClick={handleAvatarClick} disabled={saving}>
                        <span>📷</span> {saving ? 'Uploading...' : 'Update Photo'}
                    </button>
                </div>
            </div>

            {/* ═══ Stats Grid ═══ */}
            <div className="prof-stats-grid">
                <div className="prof-stat-box">
                    <span className="prof-stat-num">{user?.completed_trades || 0}</span>
                    <span className="prof-stat-label">30d Trades</span>
                </div>
                <div className="prof-stat-box">
                    <span className="prof-stat-num">{parseFloat((user?.points || 0).toFixed(1))}</span>
                    <span className="prof-stat-label">Points</span>
                </div>
                <div className="prof-stat-box">
                    <span className="prof-stat-num">{user?.trust_score || 100}%</span>
                    <span className="prof-stat-label">Trust Score</span>
                </div>
            </div>

            {/* ═══ Menu Sections ═══ */}
            <div className="prof-menu">
                {/* Leaderboard CTA */}
                <div className="prof-section" style={{ padding: '0' }}>
                    <div className="prof-nav-item" onClick={() => { haptic('light'); navigate('/leaderboard'); }} style={{ background: 'linear-gradient(45deg, rgba(240, 185, 11, 0.1), transparent)', border: '1px solid rgba(240, 185, 11, 0.2)' }}>
                        <span className="prof-nav-icon">🏆</span>
                        <div style={{ flex: 1 }}>
                            <div className="prof-nav-text" style={{ color: '#f0b90b' }}>Leaderboard</div>
                            <div className="prof-nav-sub" style={{ fontSize: '12px', color: '#848e9c' }}>Win rewards & incentives</div>
                        </div>
                        <span className="prof-nav-chevron">›</span>
                    </div>
                </div>

                {/* Payment Methods */}
                <div className="prof-section">
                    <div className="prof-section-header" onClick={() => { haptic('light'); setIsPaymentMethodsExpanded(!isPaymentMethodsExpanded); }} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <span className="prof-section-icon">💳</span>
                            <span className="prof-section-title">Payment Methods</span>
                        </div>
                        <span className="prof-nav-chevron" style={{ transform: isPaymentMethodsExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '24px', color: '#848e9c' }}>›</span>
                    </div>

                    {isPaymentMethodsExpanded && (
                        <>
                            {/* UPI */}
                            <div className="prof-payment-item">
                                <div className="prof-payment-top">
                                    <span className="prof-payment-name">📱 UPI ID</span>
                                    <button className="prof-edit-btn" onClick={() => { haptic('light'); setEditingUpi(!editingUpi); setMessage(''); }}>
                                        {editingUpi ? 'Cancel' : (user?.upi_id ? 'Edit' : 'Add')}
                                    </button>
                                </div>
                                {editingUpi ? (
                                    <div className="prof-edit-form">
                                        <input placeholder="yourname@upi" value={upiInput} onChange={e => setUpiInput(e.target.value)} autoFocus />
                                        <button className="prof-save-btn" onClick={saveUpi} disabled={saving}>
                                            {saving ? 'Saving...' : 'Save'}
                                        </button>
                                    </div>
                                ) : (
                                    <span className="prof-payment-value">{user?.upi_id || 'Not set'}</span>
                                )}
                            </div>

                            {/* Phone */}
                            <div className="prof-payment-item">
                                <div className="prof-payment-top">
                                    <span className="prof-payment-name">📞 Phone Number</span>
                                    <button className="prof-edit-btn" onClick={() => { haptic('light'); setEditingPhone(!editingPhone); setMessage(''); }}>
                                        {editingPhone ? 'Cancel' : (user?.phone_number ? 'Edit' : 'Add')}
                                    </button>
                                </div>
                                {editingPhone ? (
                                    <div className="prof-edit-form">
                                        <input type="tel" placeholder="9876543210" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} autoFocus />
                                        <button className="prof-save-btn" onClick={savePhone} disabled={saving}>
                                            {saving ? 'Saving...' : 'Save'}
                                        </button>
                                    </div>
                                ) : (
                                    <span className="prof-payment-value">{user?.phone_number || 'Not set'}</span>
                                )}
                            </div>

                            {/* Bank */}
                            <div className="prof-payment-item" style={{ borderBottom: 'none' }}>
                                <div className="prof-payment-top">
                                    <span className="prof-payment-name">🏦 Bank Transfer</span>
                                    <button className="prof-edit-btn" onClick={() => { haptic('light'); setEditingBank(!editingBank); setMessage(''); }}>
                                        {editingBank ? 'Cancel' : (user?.bank_account_number ? 'Edit' : 'Add')}
                                    </button>
                                </div>
                                {editingBank ? (
                                    <div className="prof-edit-form">
                                        <input placeholder="Account Number" value={bankAccount} onChange={e => setBankAccount(e.target.value)} autoFocus />
                                        <input placeholder="IFSC Code" value={bankIfsc} onChange={e => setBankIfsc(e.target.value.toUpperCase())} />
                                        <input placeholder="Bank Name (optional)" value={bankName} onChange={e => setBankName(e.target.value)} />
                                        <button className="prof-save-btn" onClick={saveBank} disabled={saving}>
                                            {saving ? 'Saving...' : 'Save'}
                                        </button>
                                    </div>
                                ) : user?.bank_account_number ? (
                                    <div className="prof-bank-info">
                                        <span className="prof-payment-value">{user.bank_account_number}</span>
                                        <span className="prof-bank-sub">IFSC: {user.bank_ifsc} {user.bank_name && `• ${user.bank_name}`}</span>
                                    </div>
                                ) : (
                                    <span className="prof-payment-value">Not set</span>
                                )}
                            </div>

                            {/* CDM Details */}
                            <div className="prof-payment-item" style={{ borderBottom: 'none' }}>
                                <div className="prof-payment-top">
                                    <span className="prof-payment-name">🏦 CDM Details</span>
                                    <button className="prof-edit-btn" onClick={() => { haptic('light'); setEditingCdm(!editingCdm); setMessage(''); }}>
                                        {editingCdm ? 'Cancel' : (user?.cdm_bank_number ? 'Edit' : 'Add')}
                                    </button>
                                </div>
                                {editingCdm ? (
                                    <div className="prof-edit-form">
                                        <input placeholder="Bank Number" value={cdmBankNumber} onChange={e => setCdmBankNumber(e.target.value)} />
                                        <input placeholder="Bank Name" value={cdmBankName} onChange={e => setCdmBankName(e.target.value)} />
                                        <input placeholder="Bank Linked Phone" value={cdmPhone} onChange={e => setCdmPhone(e.target.value)} />
                                        <input placeholder="Bank User Name" value={cdmUserName} onChange={e => setCdmUserName(e.target.value)} />
                                        <button className="prof-save-btn" onClick={saveCdm} disabled={saving}>
                                            {saving ? 'Saving...' : 'Save'}
                                        </button>
                                    </div>
                                ) : user?.cdm_bank_number ? (
                                    <div className="prof-bank-info">
                                        <span className="prof-payment-value">{user.cdm_bank_number}</span>
                                        <span className="prof-bank-sub">{user.cdm_bank_name} • {user.cdm_user_name}</span>
                                        <span className="prof-bank-sub">Phone: {user.cdm_phone}</span>
                                    </div>
                                ) : (
                                    <span className="prof-payment-value">Not set</span>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Custom Receive Address */}
                <div className="prof-section">
                    <div className="prof-section-header">
                        <span className="prof-section-icon">🔗</span>
                        <span className="prof-section-title">Settlement Wallet</span>
                    </div>
                    <div className="prof-payment-item" style={{ borderBottom: 'none' }}>
                        <div className="prof-payment-top">
                            <span className="prof-payment-name">Wallet to receive funds</span>
                            <button className="prof-edit-btn" onClick={() => { haptic('light'); setEditingReceiveAddr(!editingReceiveAddr); setMessage(''); }}>
                                {editingReceiveAddr ? 'Cancel' : (user?.receive_address ? 'Edit' : 'Add')}
                            </button>
                        </div>
                        {editingReceiveAddr ? (
                            <div className="prof-edit-form">
                                <input placeholder="0x..." value={receiveAddrInput} onChange={e => setReceiveAddrInput(e.target.value)} autoFocus />
                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                    <button className="prof-save-btn" onClick={saveReceiveAddr} disabled={saving} style={{ flex: 1 }}>
                                        {saving ? 'Saving...' : 'Save'}
                                    </button>
                                    <button className="prof-save-btn secondary" onClick={useDefaultWallet} disabled={saving} style={{ flex: 1 }}>
                                        Use Default
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="prof-bank-info">
                                <span className="prof-payment-value">
                                    {user?.receive_address
                                        ? `${user.receive_address.slice(0, 8)}...${user.receive_address.slice(-6)}`
                                        : user?.wallet_address
                                            ? `Default (${user.wallet_type === 'external' ? 'External' : 'Bot'}): ${user.wallet_address.slice(0, 6)}...${user.wallet_address.slice(-4)}`
                                            : 'Default Bot Wallet'
                                    }
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Status Message */}
                {message && (
                    <div className={`prof-message ${message.startsWith('success:') ? 'success' : 'error'}`}>
                        {message.replace(/^(success|error):/, '')}
                    </div>
                )}

                {/* Navigation Items */}
                <div className="prof-nav-list">
                    <div className="prof-nav-item" onClick={() => { haptic('light'); navigate('/orders'); }}>
                        <span className="prof-nav-icon">📋</span>
                        <span className="prof-nav-text">Order History</span>
                        <span className="prof-nav-chevron">›</span>
                    </div>
                    <div className="prof-nav-item" onClick={() => { haptic('light'); navigate('/ads'); }}>
                        <span className="prof-nav-icon">📢</span>
                        <span className="prof-nav-text">My Ads</span>
                        <span className="prof-nav-chevron">›</span>
                    </div>
                </div>

                {/* Wallet Info (Original Layout) */}
                <div className="prof-section">
                    <div className="prof-section-header">
                        <span className="prof-section-icon">👛</span>
                        <span className="prof-section-title">Wallet</span>
                    </div>
                    <div className="prof-wallet-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                        <div className="prof-bank-info" style={{ flex: 1 }}>
                            <span className="prof-payment-value" style={{ display: 'block', marginBottom: '4px' }}>
                                {user?.wallet_type === 'external' ? 'WalletConnect' : 'Bot Wallet'}
                            </span>
                            <span className="prof-bank-sub" style={{ fontSize: '12px', color: '#848e9c' }}>
                                {user?.wallet_address ? `${user.wallet_address.slice(0, 8)}...${user.wallet_address.slice(-6)}` : 'Internal'}
                            </span>
                        </div>
                        <button className="prof-switch-btn" onClick={() => {
                            if (window.confirm('Switch wallet?')) {
                                haptic('medium');
                                onSwitchWallet();
                            }
                        }}>
                            Switch
                        </button>
                    </div>
                </div>

                {/* Account Info */}
                <div className="prof-section">
                    <div className="prof-account-row">
                        <span className="prof-account-label">Telegram ID</span>
                        <span className="prof-account-value">{user?.telegram_id}</span>
                    </div>
                    <div className="prof-account-row" style={{ borderBottom: 'none' }}>
                        <span className="prof-account-label">Member Since</span>
                        <span className="prof-account-value">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</span>
                    </div>
                </div>

                <div className="text-center mt-8 pb-4" style={{ opacity: 0.3, fontSize: '10px' }}>
                    Build Version: {APP_VERSION}
                </div>
            </div>
        </div>
    );
}
