import React, { useState } from 'react';
import { 
    IconX, IconRefresh, IconQr, IconCopy, 
    IconTokenUSDT, IconTokenUSDC, 
    IconChainEth, IconChainBase, IconChainPolygon, IconChainArbitrum, IconChainOptimism, IconChainBsc 
} from './Icons';

interface DepositModalProps {
    onClose: () => void;
    balances: any;
    loadBalances: () => void;
    copyAddress: () => void;
    haptic: (type: "light" | "medium" | "heavy" | "error" | "success" | "warning" | "selection") => void;
}

export function DepositModal({ onClose, balances, loadBalances, copyAddress, haptic }: DepositModalProps) {
    const [routingAsset, setRoutingAsset] = useState<'USDT' | 'USDC'>('USDT');
    const [routingChain, setRoutingChain] = useState<'Ethereum' | 'Base' | 'Polygon' | 'Arbitrum' | 'Optimism'>('Ethereum');

    return (
        <div className="manage-funds-mobile-page">
            {/* Mobile Header */}
            <div className="mf-mobile-header">
                <button className="mf-back-btn" onClick={onClose}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                    Back
                </button>
                <div className="mf-mobile-title">Manage Funds</div>
                <div style={{width: 60}}></div> {/* spacer for centering */}
            </div>

            <div className="mf-mobile-content">
                <div className="mf-mobile-intro">
                    <p>Add funds to your Predict account to start making predictions. Deposit <strong>USDC</strong> from any chain — it will be automatically converted to <strong>pUSD</strong> (Polymarket's native token) 1:1.</p>
                </div>

                <div className="mf-card mf-balance-card" style={{marginBottom: 12}}>
                    <div className="mf-balance-header">
                        <span>Your pUSD Balance</span>
                        <div className="mf-balance-actions">
                            <button className="mf-btn-secondary">Withdraw</button>
                            <button className="mf-btn-icon" onClick={loadBalances}><IconRefresh size={14}/></button>
                        </div>
                    </div>
                    <div className="mf-balance-value">
                        <span className="mf-dollar">$</span>{parseFloat(balances?.usdt || '0').toFixed(0)}
                    </div>
                </div>

                {/* USDC → pUSD Conversion Banner */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    marginBottom: '16px',
                    fontSize: '13px',
                }}>
                    {/* You send */}
                    <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: 'rgba(39,117,255,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <IconTokenUSDC size={16} />
                        </div>
                        <div>
                            <div style={{color: 'rgba(255,255,255,0.5)', fontSize: '11px'}}>You send</div>
                            <div style={{fontWeight: 600}}>USDC</div>
                        </div>
                    </div>
                    {/* Arrow */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                    {/* You receive */}
                    <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: 'rgba(101,72,254,0.18)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '14px', fontWeight: 700, color: '#a78bfa'
                        }}>
                            p
                        </div>
                        <div>
                            <div style={{color: 'rgba(255,255,255,0.5)', fontSize: '11px'}}>You receive</div>
                            <div style={{fontWeight: 600}}>pUSD</div>
                        </div>
                    </div>
                    {/* 1:1 badge */}
                    <div style={{
                        marginLeft: 'auto',
                        background: 'rgba(74,222,128,0.12)',
                        color: '#4ade80',
                        borderRadius: '6px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                    }}>1:1</div>
                </div>

                {/* Predict Smart Wallet */}
                <div className="mf-card" style={{marginBottom: 16}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px'}}>
                        <IconChainBsc size={20} />
                        <h3 style={{margin: 0, fontSize: '15px'}}>Predict Smart Wallet</h3>
                    </div>
                    <p className="mf-sub">Deposit <strong>USDC</strong> on <strong>BNB Chain</strong> directly to your proxy wallet — it wraps to <strong>pUSD</strong> (1:1) automatically. <strong>Minimum deposit: 1 USDC.</strong></p>
                    
                    <div className="mf-label">SUPPORTED ASSETS</div>
                    <div className="mf-pills">
                        <div className="mf-pill mf-pill-active">
                            <IconTokenUSDT size={16}/> USDT
                        </div>
                    </div>

                    <div className="mf-address-box">
                        <div className="mf-address-text">{balances?.address || 'Loading...'}</div>
                        <button className="mf-btn-icon" onClick={() => haptic('light')}><IconQr size={16}/></button>
                        <button className="mf-btn-copy" onClick={copyAddress}>
                            <IconCopy size={14} color="black"/> Copy
                        </button>
                    </div>
                </div>

                {/* Smart Routing Address */}
                <div className="mf-card" style={{marginBottom: 40}}>
                    <h3 style={{fontSize: '15px', marginBottom: '8px'}}>Smart Routing Address</h3>
                    <p className="mf-sub">Deposit funds cross-chain from any exchange on <strong>any supported network</strong>. Your USDC is bridged to Polygon and wrapped to <strong>pUSD</strong> (1:1) automatically. <strong>Minimum deposit: 3 USDC equivalent.</strong></p>
                    
                    <div className="mf-label">SUPPORTED ASSETS</div>
                    <div className="mf-pills" style={{marginBottom: 12}}>
                        <div className={`mf-pill ${routingAsset === 'USDT' ? 'mf-pill-active' : ''}`} onClick={() => {haptic('light'); setRoutingAsset('USDT');}}>
                            <IconTokenUSDT size={16}/> USDT
                        </div>
                        <div className={`mf-pill ${routingAsset === 'USDC' ? 'mf-pill-active' : ''}`} onClick={() => {haptic('light'); setRoutingAsset('USDC');}}>
                            <IconTokenUSDC size={16}/> USDC
                        </div>
                    </div>

                    <div className="mf-label">SUPPORTED CHAINS</div>
                    <div className="mf-pills mf-pills-wrap" style={{marginBottom: 12}}>
                        <div className={`mf-pill ${routingChain === 'Ethereum' ? 'mf-pill-active' : ''}`} onClick={() => {haptic('light'); setRoutingChain('Ethereum');}}><IconChainEth size={14}/> ETH</div>
                        <div className={`mf-pill ${routingChain === 'Base' ? 'mf-pill-active' : ''}`} onClick={() => {haptic('light'); setRoutingChain('Base');}}><IconChainBase size={14}/> Base</div>
                        <div className={`mf-pill ${routingChain === 'Polygon' ? 'mf-pill-active' : ''}`} onClick={() => {haptic('light'); setRoutingChain('Polygon');}}><IconChainPolygon size={14}/> Poly</div>
                        <div className={`mf-pill ${routingChain === 'Arbitrum' ? 'mf-pill-active' : ''}`} onClick={() => {haptic('light'); setRoutingChain('Arbitrum');}}><IconChainArbitrum size={14}/> Arb</div>
                        <div className={`mf-pill ${routingChain === 'Optimism' ? 'mf-pill-active' : ''}`} onClick={() => {haptic('light'); setRoutingChain('Optimism');}}><IconChainOptimism size={14}/> OP</div>
                    </div>

                    <div className="mf-address-box">
                        <div className="mf-address-text" style={{paddingLeft: '12px'}}>{balances?.address || 'Loading...'}</div>
                        <button className="mf-btn-icon" onClick={() => haptic('light')}><IconQr size={16}/></button>
                        <button className="mf-btn-copy" onClick={copyAddress}>
                            <IconCopy size={14} color="black"/> Copy
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
