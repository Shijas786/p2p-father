import React, { useState } from 'react';
import { api } from '../lib/api';

interface WhatsAppLoginProps {
    onSuccess: (user: any, initData: string) => void;
}

export const WhatsAppLogin: React.FC<WhatsAppLoginProps> = ({ onSuccess }) => {
    const [step, setStep] = useState<'phone' | 'otp'>('phone');
    const [countryCode, setCountryCode] = useState('91');
    const [phoneInput, setPhoneInput] = useState('');
    const [otpInput, setOtpInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const fullPhone = `${countryCode}${phoneInput.replace(/[^0-9]/g, '')}`;

    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);

        if (!phoneInput || phoneInput.trim().length < 5) {
            setError('Please enter a valid phone number');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/miniapp/auth/wa-request-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: fullPhone }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Failed to send OTP code');
            }

            setSuccessMsg(data.message || 'OTP code sent to your WhatsApp!');
            setStep('otp');
        } catch (err: any) {
            setError(err?.message || 'Error sending OTP');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!otpInput || otpInput.trim().length !== 6) {
            setError('Please enter the 6-digit OTP code');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/miniapp/auth/wa-verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: fullPhone, otp: otpInput }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Invalid verification code');
            }

            localStorage.setItem('trade_init_data', data.initData);
            onSuccess(data.user, data.initData);
        } catch (err: any) {
            setError(err?.message || 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            minHeight: '100vh',
            width: '100vw',
            background: '#0B0F17',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            color: '#FFFFFF',
        }}>
            {/* Left Login Panel */}
            <div style={{
                flex: '1',
                maxWidth: '520px',
                padding: '48px 40px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                background: '#0F172A',
                borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                boxSizing: 'border-box',
            }}>
                <div>
                    {/* Brand Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '60px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '36px', height: '36px', borderRadius: '10px',
                                background: '#10B981', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', fontSize: '20px', fontWeight: 'bold'
                            }}>
                                💬
                            </div>
                            <span style={{ fontSize: '22px', fontWeight: '700', letterSpacing: '-0.5px' }}>
                                P2PFather
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#94A3B8' }}>
                            <span>🇬🇧 EN</span>
                        </div>
                    </div>

                    {/* Step 1: Phone Entry */}
                    {step === 'phone' ? (
                        <div>
                            <h1 style={{ fontSize: '32px', fontWeight: '700', margin: '0 0 12px 0', letterSpacing: '-0.5px' }}>
                                Sign in to P2PFather
                            </h1>
                            <p style={{ color: '#94A3B8', fontSize: '14px', lineHeight: '1.6', margin: '0 0 32px 0' }}>
                                You can use P2PFather entirely from WhatsApp. Come back to the web dashboard anytime to manage your wallet, orders, and active trades.
                            </p>

                            <form onSubmit={handleSendOtp}>
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>
                                        Country
                                    </label>
                                    <select
                                        value={countryCode}
                                        onChange={(e) => setCountryCode(e.target.value)}
                                        style={{
                                            width: '100%', padding: '14px 16px', background: '#1E293B',
                                            border: '1px solid #334155', borderRadius: '10px', color: '#FFF',
                                            fontSize: '15px', outline: 'none', cursor: 'pointer'
                                        }}
                                    >
                                        <option value="91">🇮🇳 India (+91)</option>
                                        <option value="1">🇺🇸 United States (+1)</option>
                                        <option value="44">🇬🇧 United Kingdom (+44)</option>
                                        <option value="971">🇦🇪 UAE (+971)</option>
                                        <option value="966">🇸🇦 Saudi Arabia (+966)</option>
                                        <option value="60">🇲🇾 Malaysia (+60)</option>
                                    </select>
                                </div>

                                <div style={{ marginBottom: '28px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>
                                        WhatsApp Phone Number
                                    </label>
                                    <input
                                        type="tel"
                                        placeholder="Enter phone number without leading 0"
                                        value={phoneInput}
                                        onChange={(e) => setPhoneInput(e.target.value)}
                                        style={{
                                            width: '100%', padding: '14px 16px', background: '#1E293B',
                                            border: '1px solid #334155', borderRadius: '10px', color: '#FFF',
                                            fontSize: '15px', outline: 'none', boxSizing: 'border-box'
                                        }}
                                    />
                                    <span style={{ display: 'block', fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                                        Example: 9876543210
                                    </span>
                                </div>

                                {error && (
                                    <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #EF4444', borderRadius: '10px', color: '#FCA5A5', fontSize: '13px', marginBottom: '20px' }}>
                                        ⚠️ {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    style={{
                                        width: '100%', padding: '16px', background: loading ? '#047857' : '#10B981',
                                        color: '#000', border: 'none', borderRadius: '12px', fontSize: '16px',
                                        fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    {loading ? 'Sending Code...' : 'Send Code to WhatsApp'}
                                </button>
                            </form>
                        </div>
                    ) : (
                        /* Step 2: OTP Entry */
                        <div>
                            <h1 style={{ fontSize: '32px', fontWeight: '700', margin: '0 0 12px 0', letterSpacing: '-0.5px' }}>
                                Enter Verification Code
                            </h1>
                            <p style={{ color: '#94A3B8', fontSize: '14px', lineHeight: '1.6', margin: '0 0 32px 0' }}>
                                We sent a 6-digit login code to your WhatsApp chat (+{fullPhone}).
                            </p>

                            {successMsg && (
                                <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10B981', borderRadius: '10px', color: '#6EE7B7', fontSize: '13px', marginBottom: '20px' }}>
                                    ✅ {successMsg}
                                </div>
                            )}

                            <form onSubmit={handleVerifyOtp}>
                                <div style={{ marginBottom: '28px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>
                                        6-Digit WhatsApp Code
                                    </label>
                                    <input
                                        type="text"
                                        maxLength={6}
                                        placeholder="123456"
                                        value={otpInput}
                                        onChange={(e) => setOtpInput(e.target.value.replace(/[^0-9]/g, ''))}
                                        style={{
                                            width: '100%', padding: '16px', background: '#1E293B',
                                            border: '1px solid #10B981', borderRadius: '10px', color: '#FFF',
                                            fontSize: '24px', letterSpacing: '8px', textAlign: 'center',
                                            fontWeight: '700', outline: 'none', boxSizing: 'border-box'
                                        }}
                                    />
                                </div>

                                {error && (
                                    <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #EF4444', borderRadius: '10px', color: '#FCA5A5', fontSize: '13px', marginBottom: '20px' }}>
                                        ⚠️ {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    style={{
                                        width: '100%', padding: '16px', background: loading ? '#047857' : '#10B981',
                                        color: '#000', border: 'none', borderRadius: '12px', fontSize: '16px',
                                        fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer',
                                        marginBottom: '16px',
                                    }}
                                >
                                    {loading ? 'Verifying...' : 'Verify & Open Dashboard'}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setStep('phone')}
                                    style={{
                                        width: '100%', background: 'transparent', color: '#94A3B8',
                                        border: 'none', fontSize: '14px', cursor: 'pointer', textDecoration: 'underline'
                                    }}
                                >
                                    Change Phone Number
                                </button>
                            </form>
                        </div>
                    )}
                </div>

                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '40px' }}>
                    By signing in, you agree to P2PFather <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Terms of Service</span> and <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Privacy Policy</span>.
                </div>
            </div>

            {/* Right Feature Showcase Panel (Matching ChatterPay Graphics) */}
            <div style={{
                flex: '1',
                background: 'radial-gradient(circle at top right, #064E3B 0%, #022C22 100%)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '60px',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Decorative background glow */}
                <div style={{
                    position: 'absolute', width: '500px', height: '500px',
                    borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)',
                    filter: 'blur(100px)', top: '-100px', right: '-100px'
                }} />

                {/* Floating Transaction Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '420px', zIndex: 10 }}>

                    {/* Card 1 */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.92)',
                        borderRadius: '16px', padding: '20px 24px', color: '#0F172A',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
                        display: 'flex', alignItems: 'center', gap: '16px',
                        transform: 'translateY(-10px)'
                    }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                            ↙
                        </div>
                        <div>
                            <div style={{ fontSize: '17px', fontWeight: '700' }}>Received ₹85,000 from Buyer</div>
                            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>+91 81379 56320 • Trade #4e22 Settled</div>
                        </div>
                    </div>

                    {/* Card 2 */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.92)',
                        borderRadius: '16px', padding: '20px 24px', color: '#0F172A',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
                        display: 'flex', alignItems: 'center', gap: '16px',
                        marginLeft: '30px'
                    }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                            ↗
                        </div>
                        <div>
                            <div style={{ fontSize: '17px', fontWeight: '700' }}>Released 100 USDT to Buyer</div>
                            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>Escrow Smart Contract Settled</div>
                        </div>
                    </div>

                    {/* Card 3 */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.92)',
                        borderRadius: '16px', padding: '20px 24px', color: '#0F172A',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
                        display: 'flex', alignItems: 'center', gap: '16px',
                        transform: 'translateY(10px)'
                    }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                            🪙
                        </div>
                        <div>
                            <div style={{ fontSize: '17px', fontWeight: '700' }}>Posted Sell Ad: 500 USDT</div>
                            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>Rate: ₹91.5 / USDT • 0% Trading Fees</div>
                        </div>
                    </div>

                    {/* Card 4 */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.92)',
                        borderRadius: '16px', padding: '20px 24px', color: '#0F172A',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
                        display: 'flex', alignItems: 'center', gap: '16px',
                        marginLeft: '30px', transform: 'translateY(15px)'
                    }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#F3E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                            🔒
                        </div>
                        <div>
                            <div style={{ fontSize: '17px', fontWeight: '700' }}>Escrow Vault Locked</div>
                            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>BSC & Base On-Chain Non-Custodial Vault</div>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '60px', fontSize: '20px', fontWeight: '600', color: '#A7F3D0', zIndex: 10, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    Use crypto P2P, directly in WhatsApp 💬
                </div>
            </div>
        </div>
    );
};
