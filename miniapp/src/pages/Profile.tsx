import { useState, useRef, useEffect } from 'react';
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
    const [themeHue, setThemeHue] = useState(160);

    // Randomize theme on mount
    useEffect(() => {
        setThemeHue(Math.floor(Math.random() * 360));
    }, []);

    // UPI State
    const [upiInput, setUpiInput] = useState(user?.upi_id || '');
    const [editingUpi, setEditingUpi] = useState(false);
    const [digitalRupeeInput, setDigitalRupeeInput] = useState(user?.digital_rupee_id || '');
    const [editingDigitalRupee, setEditingDigitalRupee] = useState(false);

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

    // Bio & Socials State
    const [bioInput, setBioInput] = useState(user?.bio || '');
    const [instagramInput, setInstagramInput] = useState(user?.instagram_handle || '');
    const [xInput, setXInput] = useState(user?.x_handle || '');
    const [editingSocials, setEditingSocials] = useState(false);

    // CDM State
    const [cdmBankNumber, setCdmBankNumber] = useState(user?.cdm_bank_number || '');
    const [cdmBankName, setCdmBankName] = useState(user?.cdm_bank_name || '');
    const [cdmPhone, setCdmPhone] = useState(user?.cdm_phone || '');
    const [cdmUserName, setCdmUserName] = useState(user?.cdm_user_name || '');
    const [editingCdm, setEditingCdm] = useState(false);

    // Privacy Mode State
    const [privacyMode, setPrivacyMode] = useState<boolean>(Boolean(user?.hide_group_handle));

    useEffect(() => {
        setPrivacyMode(Boolean(user?.hide_group_handle));
    }, [user?.hide_group_handle]);

    // KYC State
    const [kycData, setKycData] = useState<{
        kyc_status: 'unverified' | 'pending' | 'approved' | 'rejected';
        is_verified: boolean;
        kyc_verified_at: string | null;
        country: string | null;
        document_type: string | null;
    } | null>(null);
    const [kycLoading, setKycLoading] = useState(false);

    useEffect(() => {
        loadKycStatus();
    }, []);

    async function loadKycStatus() {
        try {
            const data = await api.kyc.getStatus();
            setKycData(data);
        } catch (err) {
            console.warn('KYC status check failed:', err);
        }
    }

    async function startKyc() {
        haptic('medium');
        setKycLoading(true);
        try {
            const res = await api.kyc.start();
            haptic('success');
            if (res.url) {
                if (window.Telegram?.WebApp?.openLink) {
                    window.Telegram.WebApp.openLink(res.url);
                } else {
                    window.open(res.url, '_blank');
                }
                setTimeout(loadKycStatus, 3000);
            }
        } catch (err: any) {
            haptic('error');
            alert('KYC Start Error: ' + err.message);
        } finally {
            setKycLoading(false);
        }
    }

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
            setEditingSocials(false);
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

    async function saveDigitalRupee() {
        if (!digitalRupeeInput.trim()) return;
        await saveField({ digital_rupee_id: digitalRupeeInput.trim() }, 'Digital Rupee ID updated!');
        setEditingDigitalRupee(false);
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
        // Full EVM address validation: must be 0x + exactly 40 hex characters
        const isValidEVMAddress = /^0x[a-fA-F0-9]{40}$/.test(receiveAddrInput);
        if (receiveAddrInput && !isValidEVMAddress) {
            setMessage('error:Enter a valid EVM wallet address (0x + 40 hex characters)');
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
    async function saveSocials() {
        await saveField({
            bio: bioInput.trim() || null,
            instagram_handle: instagramInput.trim() || null,
            x_handle: xInput.trim() || null,
        }, 'Socials updated!');
    }

    if (!user) {
        return (
            <div className="page flex items-center justify-center">
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div className="page profile-page animate-in" style={{ '--theme-hue': themeHue } as React.CSSProperties}>
            {/* ═══ Profile Header ═══ */}
            <div className="prof-header">
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
                    <style dangerouslySetInnerHTML={{ __html: `
                        @keyframes shootStar { 0% { transform: translateX(100%); opacity: 1; } 100% { transform: translateX(-100%); opacity: 0; } }
                    ` }} />
                    {/* Shooting Stars Background */}
                    <div style={{ width: '100%', height: '100%' }}>
                         <div style={{ position: 'absolute', top: '20%', left: '0', width: '30px', height: '1px', background: `hsl(${themeHue}, 88%, 40%)`, animation: 'shootStar 2s infinite' }} />
                         <div style={{ position: 'absolute', top: '60%', left: '0', width: '40px', height: '1px', background: `hsl(${themeHue}, 88%, 40%)`, animation: 'shootStar 3s infinite 1s' }} />
                    </div>
                </div>

                {/* Left side: Avatar */}
                <div className="prof-avatar">
                    {user?.photo_url ? (
                        <img src={user.photo_url} alt="" className="prof-avatar-img" />
                    ) : (
                        <span className="prof-avatar-letter">{user?.first_name?.[0]?.toUpperCase() || '?'}</span>
                    )}
                    
                    {/* Tool Animation SVG as Update Button Overlay */}
                    <button className="prof-avatar-tool" onClick={handleAvatarClick} disabled={saving}>
                        <img src="/icons for trade/profile icons/camera-tool.svg?v=1" alt="Update" />
                    </button>
                </div>

                {/* Right side: Info & Actions */}
                <div className="prof-info-col" style={{ flex: 1, position: 'relative', zIndex: 1 }}>
                    <div className="prof-name-row">
                        <h2 className="prof-username">{user?.first_name || 'User'}</h2>
                        {user?.username && <span className="prof-handle">@{user.username}</span>}
                    </div>

                    {/* Binance-style Identity Verification Badge / CTA Button */}
                    <div className="prof-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {kycData?.is_verified ? (
                            <div className="prof-kyc-badge verified" style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                borderRadius: '12px',
                                background: 'rgba(14, 203, 129, 0.12)',
                                border: '1px solid rgba(14, 203, 129, 0.3)',
                                color: '#0ecb81',
                                fontSize: '11px',
                                fontWeight: 700
                            }}>
                                <span>✅</span> Verified
                            </div>
                        ) : kycData?.kyc_status === 'pending' ? (
                            <button
                                className="prof-kyc-badge pending"
                                onClick={loadKycStatus}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '4px 10px',
                                    borderRadius: '12px',
                                    background: 'rgba(245, 158, 11, 0.12)',
                                    border: '1px solid rgba(245, 158, 11, 0.3)',
                                    color: '#f59e0b',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                <span>🟡</span> Pending...
                            </button>
                        ) : (
                            <button
                                className="prof-kyc-btn binance-verify"
                                onClick={startKyc}
                                disabled={kycLoading}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '5px 12px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #f0b90b 0%, #f8d33a 100%)',
                                    boxShadow: '0 2px 8px rgba(240, 185, 11, 0.25)',
                                    color: '#000',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <span>🛡️</span> {kycLoading ? 'Starting...' : 'Verify'}
                            </button>
                        )}

                        <button className="prof-edit-socials-btn" style={{ marginTop: 0 }} onClick={() => { haptic('light'); setEditingSocials(!editingSocials); setMessage(''); }}>
                            {editingSocials ? 'Cancel' : 'Edit Bio & Socials'}
                        </button>
                    </div>


                    {/* Hidden File Input & Update Button */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*"
                        style={{ display: 'none' }}
                    />
                </div>
            </div>

            {/* ═══ Bio & Socials Editing Panel ═══ */}
            {editingSocials && (
                <div className="prof-socials-edit-card animate-in">
                    <div className="prof-edit-group">
                        <label>Bio (Short description)</label>
                        <textarea 
                            placeholder="Tell traders about your reliability, working hours, etc."
                            value={bioInput}
                            onChange={e => setBioInput(e.target.value)}
                            maxLength={150}
                        />
                    </div>
                    <div className="prof-edit-grid">
                        <div className="prof-edit-group">
                            <label>Instagram Handle</label>
                            <div className="input-prefix-wrapper">
                                <span>@</span>
                                <input 
                                    placeholder="username"
                                    value={instagramInput}
                                    onChange={e => setInstagramInput(e.target.value.replace('@', ''))}
                                />
                            </div>
                        </div>
                        <div className="prof-edit-group">
                            <label>X (Twitter) Handle</label>
                            <div className="input-prefix-wrapper">
                                <span>@</span>
                                <input 
                                    placeholder="username"
                                    value={xInput}
                                    onChange={e => setXInput(e.target.value.replace('@', ''))}
                                />
                            </div>
                        </div>
                    </div>
                    <button className="prof-save-socials-btn" onClick={saveSocials} disabled={saving}>
                        {saving ? 'Updating...' : 'Save Socials & Bio'}
                    </button>
                </div>
            )}

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

            {/* ═══ Unified Menu Card ═══ */}
            <div className="prof-menu-card">
                {/* 1. Leaderboard (Primary Action) */}
                <div className="prof-nav-item" onClick={() => { haptic('light'); navigate('/leaderboard'); }} style={{ background: 'linear-gradient(45deg, rgba(240, 185, 11, 0.1), transparent)' }}>
                    <img src="/icons for trade/profile icons/leaderboard.svg?v=3" alt="" style={{ width: '28px', height: '28px', marginRight: '16px' }} />
                    <div style={{ flex: 1 }}>
                        <div className="prof-nav-text" style={{ color: '#f0b90b' }}>Leaderboard</div>
                        <div className="prof-nav-sub" style={{ fontSize: '12px', color: '#848e9c' }}>Win rewards & incentives</div>
                    </div>
                    <span className="prof-nav-chevron">›</span>
                </div>

                {/* 1.5 Rewards Hub */}
                <div className="prof-nav-item" onClick={() => { haptic('light'); navigate('/rewards'); }} style={{ background: 'linear-gradient(45deg, rgba(96, 40, 255, 0.1), transparent)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <img src="/icons for trade/profile icons/rewards-gift.svg?v=1" alt="" style={{ width: '28px', height: '28px', marginRight: '16px' }} />
                    <div style={{ flex: 1 }}>
                        <div className="prof-nav-text" style={{ color: '#8b5cf6', fontWeight: 600 }}>Rewards Hub</div>
                        <div className="prof-nav-sub" style={{ fontSize: '12px', color: '#848e9c' }}>Unlock quests & earn USDC</div>
                    </div>
                    <span className="prof-nav-chevron">›</span>
                </div>

                {/* 1.8 Didit Identity Verification (KYC) */}
                <div className="prof-nav-item" style={{
                    background: kycData?.is_verified
                        ? 'linear-gradient(45deg, rgba(14, 203, 129, 0.12), transparent)'
                        : kycData?.kyc_status === 'pending'
                            ? 'linear-gradient(45deg, rgba(245, 158, 11, 0.12), transparent)'
                            : 'linear-gradient(45deg, rgba(37, 103, 255, 0.12), transparent)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex',
                    alignItems: 'center'
                }}>
                    <div style={{ fontSize: '24px', marginRight: '16px' }}>
                        {kycData?.is_verified ? '🛡️' : kycData?.kyc_status === 'pending' ? '🟡' : '🆔'}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div className="prof-nav-text" style={{
                            color: kycData?.is_verified ? '#0ecb81' : kycData?.kyc_status === 'pending' ? '#f59e0b' : '#3b82f6',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                        }}>
                            Identity Verification (KYC)
                            {kycData?.is_verified && <span style={{ fontSize: 9, background: 'rgba(14,203,129,0.2)', padding: '2px 6px', borderRadius: 10, color: '#0ecb81' }}>VERIFIED</span>}
                        </div>
                        <div className="prof-nav-sub" style={{ fontSize: '11px', color: '#848e9c', marginTop: 2 }}>
                            {kycData?.is_verified
                                ? `Verified Document · 100% Trust Badge`
                                : kycData?.kyc_status === 'pending'
                                    ? 'Verification in progress... Tap to refresh'
                                    : 'Instant ID + Liveness check (Didit)'}
                        </div>
                    </div>
                    {kycData?.is_verified ? (
                        <span style={{ fontSize: 12, color: '#0ecb81', fontWeight: 'bold' }}>✅ Active</span>
                    ) : (
                        <button
                            className="prof-save-btn"
                            style={{
                                fontSize: 11,
                                padding: '6px 12px',
                                borderRadius: 16,
                                background: kycData?.kyc_status === 'pending' ? 'rgba(245,158,11,0.2)' : '#2567ff',
                                color: '#fff',
                                border: 'none',
                                cursor: 'pointer'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (kycData?.kyc_status === 'pending') {
                                    loadKycStatus();
                                } else {
                                    startKyc();
                                }
                            }}
                            disabled={kycLoading}
                        >
                            {kycLoading ? 'Starting...' : kycData?.kyc_status === 'pending' ? 'Refresh' : 'Verify'}
                        </button>
                    )}
                </div>

                {/* 2. Payment Methods (Expanded) */}
                <div className="prof-section-header" onClick={() => { haptic('light'); setIsPaymentMethodsExpanded(!isPaymentMethodsExpanded); }} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <img src="/icons for trade/profile icons/payment-methods.svg?v=4" alt="" style={{ width: '28px', height: '28px', marginRight: '16px' }} />
                        <span className="prof-section-title">Payment Methods</span>
                    </div>
                    <span className="prof-nav-chevron" style={{ transform: isPaymentMethodsExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '24px', color: '#848e9c' }}>›</span>
                </div>

                {isPaymentMethodsExpanded && (
                    <div className="prof-payment-expanded-well">
                        {/* UPI */}
                        <div className="prof-payment-item">
                            <div className="prof-payment-top">
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <img src="/icons for trade/payment-methods/upi.svg?v=2" alt="" style={{ width: '22px', height: '22px', marginRight: '10px' }} />
                                    <span className="prof-payment-name">UPI ID</span>
                                </div>
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
                        {/* Digital Rupee */}
                        <div className="prof-payment-item">
                            <div className="prof-payment-top">
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <img src="/icons for trade/payment-methods/digital-rupee.svg?v=2" alt="" style={{ width: '22px', height: '22px', marginRight: '10px' }} />
                                    <span className="prof-payment-name">Digital Rupee (e₹)</span>
                                </div>
                                <button className="prof-edit-btn" onClick={() => { haptic('light'); setEditingDigitalRupee(!editingDigitalRupee); setMessage(''); }}>
                                    {editingDigitalRupee ? 'Cancel' : (user?.digital_rupee_id ? 'Edit' : 'Add')}
                                </button>
                            </div>
                            {editingDigitalRupee ? (
                                <div className="prof-edit-form">
                                    <input placeholder="Digital Rupee VPA/ID" value={digitalRupeeInput} onChange={e => setDigitalRupeeInput(e.target.value)} autoFocus />
                                    <button className="prof-save-btn" onClick={saveDigitalRupee} disabled={saving}>
                                        {saving ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                            ) : (
                                <span className="prof-payment-value">{user?.digital_rupee_id || 'Not set'}</span>
                            )}
                        </div>
                        {/* Phone */}
                        <div className="prof-payment-item">
                            <div className="prof-payment-top">
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <img src="/icons for trade/payment-methods/phone.svg?v=2" alt="" style={{ width: '22px', height: '22px', marginRight: '10px' }} />
                                    <span className="prof-payment-name">Phone Number</span>
                                </div>
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
                        <div className="prof-payment-item">
                            <div className="prof-payment-top">
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <img src="/icons for trade/payment-methods/bank.svg?v=2" alt="" style={{ width: '22px', height: '22px', marginRight: '10px' }} />
                                    <span className="prof-payment-name">Bank Transfer</span>
                                </div>
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
                        {/* CDM Detail */}
                        <div className="prof-payment-item" style={{ borderBottom: 'none' }}>
                            <div className="prof-payment-top">
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <img src="/icons for trade/payment-methods/cdm.svg?v=2" alt="" style={{ width: '22px', height: '22px', marginRight: '10px' }} />
                                    <span className="prof-payment-name">CDM Details</span>
                                </div>
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
                    </div>
                )}




                {/* 2.5 Privacy Mode Toggle */}
                <div className="prof-payment-item">
                    <div className="prof-payment-top">
                        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                            <img src="/icons for trade/profile icons/privacy-mode.svg?v=1" alt="" style={{ width: '28px', height: '28px', marginRight: '16px' }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span className="prof-payment-name">Broadcast Privacy</span>
                                <span className="prof-payment-value" style={{ fontSize: '11px', color: '#848e9c' }}>
                                    {privacyMode 
                                        ? `Stealth Active (@${user?.username ? user.username.slice(0, 2) : 'us'}***)` 
                                        : `Public Handle (@${user?.username || 'username'})`}
                                </span>
                            </div>
                        </div>

                        {/* Style #2: Neon Emerald Pulse Switch */}
                        <div 
                            className={`toggle-s2 ${privacyMode ? 'active' : ''}`} 
                            onClick={async () => {
                                haptic('medium');
                                const nextVal = !privacyMode;
                                setPrivacyMode(nextVal);
                                try {
                                    await api.profile.update({ hide_group_handle: nextVal });
                                    haptic('success');
                                    onUpdate();
                                } catch (err) {
                                    console.warn('Backend sync warning:', err);
                                }
                            }}
                            title="Toggle Broadcast Privacy"
                        >
                            <div className="knob" />
                        </div>
                    </div>
                </div>

                {/* 3. Hot Wallet Address */}
                <div className="prof-payment-item">
                    <div className="prof-payment-top">
                        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                            <img src="/icons for trade/profile icons/receiving-wallet.svg?v=3" alt="" style={{ width: '28px', height: '28px', marginRight: '16px' }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span className="prof-payment-name">Receive Wallet Address</span>
                                {!editingReceiveAddr && (
                                    <span className="prof-payment-value" style={{ fontSize: '11px' }}>
                                        {user?.receive_address
                                            ? `${user.receive_address.slice(0, 8)}...${user.receive_address.slice(-6)}`
                                            : user?.wallet_address
                                                ? `Default: ${user.wallet_address.slice(0, 6)}...${user.wallet_address.slice(-4)}`
                                                : 'Default Bot Wallet'
                                        }
                                    </span>
                                )}
                            </div>
                        </div>
                        <button className="prof-edit-btn" onClick={() => { haptic('light'); setEditingReceiveAddr(!editingReceiveAddr); setMessage(''); }}>
                            {editingReceiveAddr ? 'Cancel' : (user?.receive_address ? 'Edit' : 'Add')}
                        </button>
                    </div>
                    {editingReceiveAddr && (
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
                    )}
                </div>

                {/* 4. Order History */}
                <div className="prof-nav-item" onClick={() => { haptic('light'); navigate('/orders'); }}>
                    <img src="/icons for trade/profile icons/order-history.svg?v=3" alt="" style={{ width: '28px', height: '28px', marginRight: '16px' }} />
                    <span className="prof-nav-text">Order History</span>
                    <span className="prof-nav-chevron">›</span>
                </div>

                {/* 5. Ads */}
                <div className="prof-nav-item" onClick={() => { haptic('light'); navigate('/ads'); }}>
                    <img src="/icons for trade/profile icons/my-ads.svg?v=4" alt="" style={{ width: '28px', height: '28px', marginRight: '16px' }} />
                    <span className="prof-nav-text">My Ads</span>
                    <span className="prof-nav-chevron">›</span>
                </div>

                {/* 5. Connected Wallet Info */}
                <div className="prof-wallet-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                        <img 
                            src={`/icons for trade/profile icons/${user?.wallet_type === 'external' ? 'external-wallet.svg?v=1' : 'connected-wallet.svg?v=4'}`} 
                            alt="" 
                            style={{ width: '28px', height: '28px', marginRight: '16px' }} 
                        />
                        <div className="prof-bank-info">
                            <span className="prof-payment-value" style={{ display: 'block', marginBottom: '4px', color: '#eaecef' }}>
                                {user?.wallet_type === 'external' ? 'WalletConnect' : 'Bot Wallet'}
                            </span>
                            <span className="prof-bank-sub" style={{ fontSize: '11px' }}>
                                Connected Wallet • {user?.wallet_address ? `${user.wallet_address.slice(0, 8)}...${user.wallet_address.slice(-6)}` : 'Internal'}
                            </span>
                        </div>
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

            {/* Status Message */}
            {message && (
                <div className={`prof-message ${message.startsWith('success:') ? 'success' : 'error'}`}>
                    {message.replace(/^(success|error):/, '')}
                </div>
            )}

            <div className="text-center" style={{ opacity: 0.3, fontSize: '10px', padding: '12px 0 4px' }}>
                Build Version: {APP_VERSION}
            </div>
        </div>
    );
}
