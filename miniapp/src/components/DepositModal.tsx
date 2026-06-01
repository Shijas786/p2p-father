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
                    <p>Add funds to your Predict account to start making predictions. Your account requires USDT to get started.</p>
                </div>

                {/* Balance Box */}
                <div className="mf-card mf-balance-card" style={{marginBottom: 16}}>
                    <div className="mf-balance-header">
                        <span>Your USDT Balance</span>
                        <div className="mf-balance-actions">
                            <button className="mf-btn-secondary">Withdraw</button>
                            <button className="mf-btn-icon" onClick={loadBalances}><IconRefresh size={14}/></button>
                        </div>
                    </div>
                    <div className="mf-balance-value">
                        <span className="mf-dollar">$</span>{parseFloat(balances?.usdt || '0').toFixed(0)}
                    </div>
                </div>

                {/* Predict Smart Wallet */}
                <div className="mf-card" style={{marginBottom: 16}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px'}}>
                        <IconChainBsc size={20} />
                        <h3 style={{margin: 0, fontSize: '15px'}}>Predict Smart Wallet</h3>
                    </div>
                    <p className="mf-sub">Deposit <strong>USDT</strong> on <strong>BNB Chain</strong> directly to your proxy wallet. <strong>Minimum deposit: 3 USDT.</strong></p>
                    
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
                    <p className="mf-sub">Deposit funds cross-chain from your favorite exchanges on <strong>any of our supported networks</strong>. If you deposit USDC, it will be swapped to USDT. <strong>Minimum deposit: 3 USDT (or equivalent).</strong></p>
                    
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
