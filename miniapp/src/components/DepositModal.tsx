import React, { useState, useEffect } from 'react';
import { 
    IconX, IconRefresh, IconQr, IconCopy, 
    IconTokenUSDT, IconTokenUSDC, 
    IconChainEth, IconChainBase, IconChainPolygon, IconChainArbitrum, IconChainOptimism, IconChainBsc 
} from './Icons';
import { api } from '../lib/api';

interface DepositModalProps {
    onClose: () => void;
    balances: any;
    loadBalances: () => void;
    copyAddress: () => void;
    haptic: (type: "light" | "medium" | "heavy" | "error" | "success" | "warning" | "selection") => void;
    onWithdraw?: () => void;
}

interface WalletAsset {
    id: string;
    token: 'USDT' | 'USDC';
    chain: 'Polygon' | 'BSC';
    balance: number;
    icon: React.ComponentType<any>;
    chainIcon: React.ComponentType<any>;
}

export function DepositModal({ onClose, balances, loadBalances, copyAddress, haptic, onWithdraw }: DepositModalProps) {
    const [step, setStep] = useState<'options' | 'assets' | 'amount' | 'confirm' | 'processing' | 'success' | 'manual'>('options');
    const [selectedAsset, setSelectedAsset] = useState<WalletAsset | null>(null);
    const [amount, setAmount] = useState('');
    const [txHash, setTxHash] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [hotBalances, setHotBalances] = useState<any>(null);
    const [loadingBal, setLoadingBal] = useState(false);
    const [isCheckingDeposit, setIsCheckingDeposit] = useState(false);
    const [bridgePending, setBridgePending] = useState(false);
    const [bridgeAddressState, setBridgeAddressState] = useState('');
    const [balanceBefore, setBalanceBefore] = useState<number>(0);
    const [elapsedSecs, setElapsedSecs] = useState(0);

    // Poll while manual step is open
    useEffect(() => {
        let timer: any;
        if (step === 'manual') {
            timer = setInterval(async () => {
                try {
                    const res = await api.predictions.checkDeposit();
                    if (res.wrapped) {
                        loadBalances();
                        setStep('success');
                        haptic('success');
                    }
                } catch (e) { }
            }, 10000);
        }
        return () => clearInterval(timer);
    }, [step, loadBalances, haptic]);

    // Poll bridge status & pUSD balance after bridge deposit
    useEffect(() => {
        if (!bridgePending) return;
        let elapsed = 0;
        const elapsedTimer = setInterval(() => { elapsed++; setElapsedSecs(elapsed); }, 1000);
        const pollTimer = setInterval(async () => {
            try {
                // Poll bridge API if we have the address
                if (bridgeAddressState) {
                    const statusRes = await api.predictions.checkBridgeStatus(bridgeAddressState);
                    if (statusRes && statusRes.status === 'COMPLETED') {
                        setBridgePending(false);
                        loadBalances();
                        haptic('success');
                        return;
                    }
                }

                // Fallback to balance polling
                const b = await api.predictions.getBalance();
                const newBal = parseFloat(b.balance || '0');
                if (newBal > balanceBefore) {
                    setBridgePending(false);
                    loadBalances();
                    haptic('success');
                }
            } catch (e) {}
        }, 5000);
        return () => { clearInterval(elapsedTimer); clearInterval(pollTimer); };
    }, [bridgePending, balanceBefore, bridgeAddressState, loadBalances, haptic]);

    const handleManualCheck = async () => {
        haptic('light');
        setIsCheckingDeposit(true);
        try {
            const res = await api.predictions.checkDeposit();
            if (res.wrapped) {
                loadBalances();
                setStep('success');
                haptic('success');
            }
        } catch (e) {}
        setTimeout(() => setIsCheckingDeposit(false), 1000);
    };

    const loadHotBalances = async () => {
        setLoadingBal(true);
        try {
            const data = await api.wallet.getBotBalances();
            setHotBalances(data);
        } catch (e) {
            console.error("Failed to load bot wallet balances:", e);
        } finally {
            setLoadingBal(false);
        }
    };

    useEffect(() => {
        loadHotBalances();
    }, []);

    // Get asset list with exact values
    const availableAssets: WalletAsset[] = [
        {
            id: 'poly_usdc',
            token: 'USDC',
            chain: 'Polygon',
            balance: parseFloat(hotBalances?.usdc || '0'),
            icon: IconTokenUSDC,
            chainIcon: IconChainPolygon
        },
        {
            id: 'bsc_usdc',
            token: 'USDC',
            chain: 'BSC',
            balance: parseFloat(hotBalances?.bsc_usdc || '0'),
            icon: IconTokenUSDC,
            chainIcon: IconChainBsc
        },
        {
            id: 'poly_usdt',
            token: 'USDT',
            chain: 'Polygon',
            balance: parseFloat(hotBalances?.usdt || '0'),
            icon: IconTokenUSDT,
            chainIcon: IconChainPolygon
        },
        {
            id: 'bsc_usdt',
            token: 'USDT',
            chain: 'BSC',
            balance: parseFloat(hotBalances?.bsc_usdt || '0'),
            icon: IconTokenUSDT,
            chainIcon: IconChainBsc
        }
    ];

    const handleQuickPercent = (pct: number) => {
        haptic('light');
        if (selectedAsset && selectedAsset.balance > 0) {
            setAmount((selectedAsset.balance * pct).toFixed(2));
        }
    };

    const handleConfirmDeposit = async () => {
        haptic('medium');
        setStep('processing');
        setErrorMsg('');
        try {
            const currentBal = await api.predictions.getBalance();
            setBalanceBefore(parseFloat(currentBal.balance || '0'));
        } catch (e) {}
        try {
            const r = await api.predictions.depositGasless(parseFloat(amount), selectedAsset?.chain, selectedAsset?.token);
            if (r && r.txHash) {
                setTxHash(r.txHash);
                haptic('success');
                setStep('success');
                // For bridge deposits (non-Polygon), start polling for bridge status
                const isNativePolygon = selectedAsset?.chain === 'Polygon' && selectedAsset?.token === 'USDC';
                if (!isNativePolygon) {
                    if (r.bridgeAddress) setBridgeAddressState(r.bridgeAddress);
                    setBridgePending(true);
                    setElapsedSecs(0);
                }
                loadBalances();
                loadHotBalances();
            } else {
                throw new Error("Invalid response from server");
            }
        } catch (err: any) {
            console.error("Gasless deposit failed:", err);
            setErrorMsg(err.message || "Deposit transaction failed.");
            setStep('confirm');
            haptic('error');
        }
    };

    return (
        <div className="manage-funds-mobile-page pm-deposit-modal-redesign">
            {/* Inline Custom styles matching screenshots */}
            <style>{`
                .pm-deposit-modal-redesign {
                    background: #111318;
                    color: #ffffff;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    top: 50% !important;
                    transform: translate(-50%, -50%) !important;
                    height: auto !important;
                    max-height: 85vh !important;
                    max-width: 380px !important;
                    border-radius: 16px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                .pm-dep-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 16px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                }
                .pm-dep-title {
                    font-size: 15px;
                    font-weight: 700;
                    text-align: center;
                    flex: 1;
                }
                .pm-dep-balance-sub {
                    font-size: 11px;
                    color: #848e9c;
                    margin-top: 2px;
                }
                .pm-dep-close, .pm-dep-back {
                    background: none;
                    border: none;
                    color: #848e9c;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    font-size: 14px;
                    font-weight: 600;
                }
                .pm-dep-content {
                    padding: 18px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    height: calc(100% - 60px);
                    overflow-y: auto;
                }
                .pm-wallet-card {
                    background: #161920;
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    border-radius: 12px;
                    padding: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .pm-wallet-info {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .pm-wallet-avatar {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #10141d 0%, #1c252e 100%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #6366f1;
                }
                .pm-wallet-addr {
                    font-size: 14px;
                    font-weight: 700;
                }
                .pm-wallet-bal {
                    font-size: 12px;
                    color: #848e9c;
                    margin-top: 2px;
                }
                .pm-dep-option {
                    background: #161920;
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    border-radius: 10px;
                    padding: 10px 14px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    cursor: pointer;
                }
                .pm-option-left {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .pm-option-icon {
                    width: 38px;
                    height: 38px;
                    border-radius: 10px;
                    background: rgba(255, 255, 255, 0.04);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #fff;
                }
                .pm-option-title {
                    font-size: 14px;
                    font-weight: 700;
                }
                .pm-option-sub {
                    font-size: 11px;
                    color: #848e9c;
                    margin-top: 2px;
                }
                
                /* Asset row styles matching screenshot */
                .pm-asset-selector-list {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .pm-asset-item-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: #161920;
                    border: 1px solid rgba(255, 255, 255, 0.04);
                    border-radius: 8px;
                    padding: 6px 10px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .pm-asset-item-row.active {
                    border-color: #ffffff;
                    background: rgba(255, 255, 255, 0.02);
                }
                .pm-asset-item-left {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .pm-asset-icon-wrapper {
                    position: relative;
                    width: 24px;
                    height: 24px;
                }
                .pm-asset-chain-badge {
                    position: absolute;
                    bottom: -2px;
                    right: -2px;
                    background: #111318;
                    border-radius: 50%;
                    width: 16px;
                    height: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .pm-asset-chain-badge svg {
                    width: 10px;
                    height: 10px;
                }
                .pm-asset-meta {
                    display: flex;
                    flex-direction: column;
                    line-height: 1.2;
                    gap: 2px;
                }
                .pm-asset-title {
                    font-size: 13px;
                    font-weight: 700;
                    color: #fff;
                }
                .pm-asset-subtitle {
                    font-size: 10px;
                    color: #848e9c;
                }
                .pm-asset-value-col {
                    text-align: right;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    justify-content: center;
                    line-height: 1.2;
                    gap: 2px;
                }
                .pm-asset-bal-usd {
                    font-size: 13px;
                    font-weight: 700;
                    color: #fff;
                }
                .pm-low-balance-badge {
                    font-size: 9px;
                    color: #848e9c;
                    background: rgba(255, 255, 255, 0.04);
                    padding: 1px 6px;
                    border-radius: 6px;
                }

                .pm-big-amount-wrapper {
                    text-align: center;
                    margin: 20px 0;
                }
                .pm-big-amount {
                    font-size: 54px;
                    font-weight: 600;
                    color: #fff;
                    background: transparent;
                    border: none;
                    outline: none;
                    text-align: center;
                    width: 100%;
                }
                .pm-pct-row {
                    display: flex;
                    gap: 8px;
                    justify-content: center;
                    margin-top: 14px;
                }
                .pm-pct-btn {
                    background: rgba(255, 255, 255, 0.04);
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    color: #fff;
                    border-radius: 20px;
                    padding: 6px 16px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                }
                .pm-pct-btn:active {
                    background: rgba(255, 255, 255, 0.1);
                }
                .pm-btn-continue {
                    background: #007aff;
                    color: #fff;
                    border: none;
                    border-radius: 12px;
                    padding: 14px;
                    font-size: 15px;
                    font-weight: 700;
                    cursor: pointer;
                    width: 100%;
                    text-align: center;
                    margin-top: auto;
                }
                .pm-btn-continue:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .pm-breakdown-card {
                    background: #161920;
                    border-radius: 12px;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .pm-breakdown-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 13px;
                    color: #848e9c;
                }
                .pm-breakdown-val {
                    color: #fff;
                    font-weight: 600;
                }
            `}</style>

            {/* HEADER */}
            <div className="pm-dep-header">
                {step !== 'options' ? (
                    <button className="pm-dep-back" onClick={() => {
                        haptic('selection');
                        if (step === 'assets') setStep('options');
                        else if (step === 'amount') setStep('assets');
                        else if (step === 'confirm') setStep('amount');
                        else if (step === 'manual') setStep('options');
                    }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                ) : (
                    <button className="pm-dep-back" onClick={onClose}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                )}
                
                <div className="pm-dep-title">
                    <div>Deposit</div>
                    <div className="pm-dep-balance-sub">FatherBot Balance: ${parseFloat(balances?.usdt || '0').toFixed(2)}</div>
                </div>

                <button className="pm-dep-close" onClick={onClose}>×</button>
            </div>

            {/* STEP 1: SELECT OPTIONS */}
            {step === 'options' && (
                <div className="pm-dep-content">
                    {/* Hot Wallet Card */}
                    <div className="pm-wallet-card">
                        <div className="pm-wallet-info">
                            <div className="pm-wallet-avatar">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M16 11h4v4h-4z"/></svg>
                            </div>
                            <div>
                                <div className="pm-wallet-addr">App Hot Wallet</div>
                                <div className="pm-wallet-bal">
                                    USDT: ${(parseFloat(hotBalances?.usdt || '0') + parseFloat(hotBalances?.bsc_usdt || '0')).toFixed(2)} | USDC: ${(parseFloat(hotBalances?.usdc || '0') + parseFloat(hotBalances?.bsc_usdc || '0')).toFixed(2)}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mf-label" style={{marginTop: 10}}>Deposit Options</div>

                    {/* Option: Bot Wallet Deposit (New Unified List Path) */}
                    <div className="pm-dep-option" onClick={() => {
                        haptic('light');
                        setStep('assets');
                    }}>
                        <div className="pm-option-left">
                            <div className="pm-option-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="8" width="18" height="12" rx="3" /><circle cx="9" cy="14" r="1.5" fill="currentColor" /><circle cx="15" cy="14" r="1.5" fill="currentColor" /><line x1="12" y1="4" x2="12" y2="8" /><circle cx="12" cy="3" r="1" fill="currentColor" /></svg>
                            </div>
                            <div>
                                <div className="pm-option-title">Deposit from Bot Wallet</div>
                                <div className="pm-option-sub">Transfer USDT/USDC from your app hot wallet instantly</div>
                            </div>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#848e9c" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </div>

                    {/* Option: Manual Transfer via Bridge Address */}
                    <div className="pm-dep-option" onClick={() => { haptic('light'); setStep('manual'); }}>
                        <div className="pm-option-left">
                            <div className="pm-option-icon">
                                <IconQr size={20} />
                            </div>
                            <div>
                                <div className="pm-option-title">Manual Bridge Transfer</div>
                                <div className="pm-option-sub">Show proxy address & QR code for external deposits</div>
                            </div>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#848e9c" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                </div>
            )}

            {/* STEP 1.5: CHOOSE ASSET (Unified selector layout matching mockup) */}
            {step === 'assets' && (
                <div className="pm-dep-content">
                    <div className="pm-asset-selector-list">
                        {availableAssets.map((asset) => {
                            const isLow = asset.balance < 1.0;
                            const TokenIcon = asset.icon;
                            const ChainIcon = asset.chainIcon;
                            const isActive = selectedAsset?.id === asset.id;

                            return (
                                <div 
                                    key={asset.id} 
                                    className={`pm-asset-item-row ${isActive ? 'active' : ''}`}
                                    onClick={() => {
                                        haptic('light');
                                        setSelectedAsset(asset);
                                    }}
                                >
                                    <div className="pm-asset-item-left">
                                        <div className="pm-asset-icon-wrapper">
                                            <TokenIcon size={24} />
                                            <div className="pm-asset-chain-badge">
                                                <ChainIcon size={10} />
                                            </div>
                                        </div>
                                        <div className="pm-asset-meta">
                                            <span className="pm-asset-title">
                                                {asset.token} <span style={{fontSize: 10, color: '#848e9c', fontWeight: 'normal'}}>on {asset.chain}</span>
                                            </span>
                                            <span className="pm-asset-subtitle">{asset.balance.toFixed(5)} {asset.token}</span>
                                        </div>
                                    </div>
                                    <div className="pm-asset-value-col">
                                        <span className="pm-asset-bal-usd">${asset.balance.toFixed(2)}</span>
                                        {isLow && <span className="pm-low-balance-badge">Low Balance</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <button 
                        className="pm-btn-continue" 
                        disabled={!selectedAsset}
                        onClick={() => { haptic('selection'); setAmount(''); setStep('amount'); }}
                    >
                        Continue
                    </button>
                </div>
            )}

            {/* STEP 2: ENTER AMOUNT */}
            {step === 'amount' && selectedAsset && (
                <div className="pm-dep-content">
                    <div className="pm-big-amount-wrapper">
                        <input type="number" className="pm-big-amount" value={amount} 
                            placeholder="0" onChange={e => setAmount(e.target.value)} autoFocus />
                        <div style={{color: '#848e9c', fontSize: '13px', marginTop: '6px'}}>
                            Available Balance: {selectedAsset.balance.toFixed(2)} {selectedAsset.token} ({selectedAsset.chain})
                        </div>
                    </div>

                    <div className="pm-pct-row">
                        <button className="pm-pct-btn" onClick={() => handleQuickPercent(0.25)}>25%</button>
                        <button className="pm-pct-btn" onClick={() => handleQuickPercent(0.50)}>50%</button>
                        <button className="pm-pct-btn" onClick={() => handleQuickPercent(0.75)}>75%</button>
                        <button className="pm-pct-btn" onClick={() => handleQuickPercent(1.00)}>Max</button>
                    </div>

                    <div className="pm-breakdown-card" style={{marginTop: 30}}>
                        <div className="pm-breakdown-row">
                            <span>You send</span>
                            <span className="pm-breakdown-val">{amount || '0'} {selectedAsset.token} ({selectedAsset.chain})</span>
                        </div>
                        <div className="pm-breakdown-row">
                            <span>You receive</span>
                            <span className="pm-breakdown-val" style={{color: '#4ade80'}}>{amount || '0'} pUSD</span>
                        </div>
                    </div>

                    <button className="pm-btn-continue" 
                        disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > selectedAsset.balance}
                        onClick={() => { haptic('selection'); setStep('confirm'); }}>
                        Continue
                    </button>
                </div>
            )}

            {/* STEP 3: CONFIRM & EXECUTE */}
            {step === 'confirm' && selectedAsset && (
                <div className="pm-dep-content">
                    <div className="pm-big-amount-wrapper">
                        <div style={{fontSize: '48px', fontWeight: 'bold'}}>${amount}</div>
                        <div style={{fontSize: '13px', color: '#848e9c'}}>Deposit Confirmation</div>
                    </div>

                    <div className="pm-breakdown-card">
                        <div className="pm-breakdown-row">
                            <span>Source</span>
                            <span className="pm-breakdown-val">Bot Wallet ({selectedAsset.token} on {selectedAsset.chain})</span>
                        </div>
                        <div className="pm-breakdown-row">
                            <span>Destination</span>
                            <span className="pm-breakdown-val">Polymarket Wallet</span>
                        </div>
                        <div className="pm-breakdown-row">
                            <span>Estimated Time</span>
                            <span className="pm-breakdown-val">Instant</span>
                        </div>
                        <div className="pm-breakdown-row">
                            <span>Fee / Slippage</span>
                            <span className="pm-breakdown-val">0.00%</span>
                        </div>
                    </div>

                    {errorMsg && (
                        <div style={{color: '#ff4d4f', fontSize: '13px', textAlign: 'center', marginTop: 10}}>
                            {errorMsg}
                        </div>
                    )}

                    <button className="pm-btn-continue" style={{background: '#007aff', color: '#fff'}} onClick={handleConfirmDeposit}>
                        Confirm Order
                    </button>
                </div>
            )}

            {/* STEP 4: PROCESSING */}
            {step === 'processing' && (
                <div className="pm-dep-content" style={{justifyContent: 'center', alignItems: 'center', gap: '20px'}}>
                    <div className="pm-spinner pm-spinner-lg" style={{width: 50, height: 50, borderWidth: '3px'}}></div>
                    <div style={{fontSize: '16px', fontWeight: 'bold'}}>Processing Transaction...</div>
                    <div style={{color: '#848e9c', fontSize: '13px', textAlign: 'center'}}>
                        Updating predictions balances. Please do not close this screen.
                    </div>
                </div>
            )}

            {/* STEP 5: SUCCESS */}
            {step === 'success' && (
                <div className="pm-dep-content" style={{justifyContent: 'center', alignItems: 'center', gap: '16px'}}>
                    <div style={{
                        width: '64px', height: '64px', borderRadius: '50%',
                        background: 'rgba(14,203,129,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#0ecb81', fontSize: '32px'
                    }}>
                        ✓
                    </div>
                    <div style={{fontSize: '18px', fontWeight: 'bold'}}>Transfer Sent!</div>

                    {/* Bridge pending banner */}
                    {bridgePending ? (
                        <div style={{ background: 'rgba(251,188,4,0.1)', border: '1px solid rgba(251,188,4,0.3)', borderRadius: 12, padding: '12px 16px', width: '100%', boxSizing: 'border-box' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <div className="pm-spinner" style={{ width: 14, height: 14, borderWidth: 2, borderColor: 'rgba(251,188,4,0.3)', borderTopColor: '#fbbe04' }}/>
                                <span style={{ color: '#fbbe04', fontWeight: 700, fontSize: 13 }}>Bridge Processing…</span>
                                <span style={{ color: '#848e9c', fontSize: 11, marginLeft: 'auto' }}>{Math.floor(elapsedSecs / 60)}:{String(elapsedSecs % 60).padStart(2, '0')}</span>
                            </div>
                            <div style={{ color: '#848e9c', fontSize: 12 }}>Your {selectedAsset?.token} is being bridged to Polygon and converted to pUSD (1:1). This typically takes 5–20 minutes. Your balance will auto-update when complete.</div>
                        </div>
                    ) : (
                        <div style={{ background: 'rgba(14,203,129,0.1)', border: '1px solid rgba(14,203,129,0.3)', borderRadius: 12, padding: '12px 16px', width: '100%', boxSizing: 'border-box', textAlign: 'center' }}>
                            <div style={{ color: '#0ecb81', fontWeight: 700, fontSize: 14 }}>✓ Balance Updated!</div>
                            <div style={{ color: '#848e9c', fontSize: 12, marginTop: 4 }}>Your pUSD balance has been credited.</div>
                        </div>
                    )}

                    {txHash && (
                        <a
                            href={selectedAsset?.chain === 'BSC'
                                ? `https://bscscan.com/tx/${txHash}`
                                : `https://polygonscan.com/tx/${txHash}`}
                            target="_blank" rel="noreferrer"
                            style={{ fontSize: 11, color: '#007aff', fontFamily: 'monospace', textDecoration: 'none' }}
                        >
                            TX: {txHash.slice(0, 12)}...{txHash.slice(-6)} ↗
                        </a>
                    )}
                    <button className="pm-btn-continue" onClick={onClose}>
                        {bridgePending ? 'Close (Bridge Running in Background)' : 'Close'}
                    </button>
                </div>
            )}

            {/* STEP 6: MANUAL TRANSFER (FALLBACK) */}
            {step === 'manual' && (
                <div className="pm-dep-content" style={{overflowY: 'auto'}}>
                    <div className="mf-mobile-intro">
                        <p>Deposit funds cross-chain from any exchange on <strong>any supported network</strong>. Your USDC is bridged to Polygon and wrapped to <strong>pUSD</strong> (1:1) automatically. <strong>Minimum deposit: 3 USDC equivalent.</strong></p>
                    </div>

                    <div className="mf-card">
                        <h3>Smart Routing Address</h3>
                        
                        <div className="mf-label">SUPPORTED ASSETS</div>
                        <div className="mf-pills" style={{marginBottom: 12}}>
                            <div className="mf-pill mf-pill-active"><IconTokenUSDT size={16}/> USDT</div>
                            <div className="mf-pill mf-pill-active"><IconTokenUSDC size={16}/> USDC</div>
                        </div>

                        <div className="mf-label">SUPPORTED CHAINS</div>
                        <div className="mf-pills mf-pills-wrap" style={{marginBottom: 12}}>
                            <div className="mf-pill mf-pill-active"><IconChainEth size={14}/> ETH</div>
                            <div className="mf-pill mf-pill-active"><IconChainBase size={14}/> Base</div>
                            <div className="mf-pill mf-pill-active"><IconChainPolygon size={14}/> Poly</div>
                            <div className="mf-pill mf-pill-active"><IconChainArbitrum size={14}/> Arb</div>
                            <div className="mf-pill mf-pill-active"><IconChainOptimism size={14}/> OP</div>
                        </div>

                        <div className="mf-address-box">
                            <div className="mf-address-text" style={{paddingLeft: '12px'}}>{balances?.address || 'Loading...'}</div>
                            <button className="mf-btn-icon" onClick={() => haptic('light')}><IconQr size={16}/></button>
                            <button className="mf-btn-copy" onClick={copyAddress}>
                                <IconCopy size={14} color="black"/> Copy
                            </button>
                        </div>
                        <button 
                            className="pm-btn-continue" 
                            style={{marginTop: 16, backgroundColor: isCheckingDeposit ? '#4a4a4a' : 'white', color: isCheckingDeposit ? '#ffffff' : '#1e1e1e'}} 
                            onClick={handleManualCheck}
                            disabled={isCheckingDeposit}
                        >
                            {isCheckingDeposit ? 'Checking Network...' : 'Check For Deposit'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

