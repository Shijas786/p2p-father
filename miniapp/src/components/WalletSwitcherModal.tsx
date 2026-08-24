import React, { useState } from 'react';
import { AppUser } from '../hooks/useAuth';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { useAppKit } from '@reown/appkit/react';
import { useAccount } from 'wagmi';
import './WalletSwitcherModal.css';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    user: AppUser | null;
    onUserRefresh: () => Promise<void>;
    onSwitchMode: (mode: 'bot' | 'external') => void;
}

export function WalletSwitcherModal({ isOpen, onClose, user, onUserRefresh, onSwitchMode }: Props) {
    const appKit = useAppKit();
    const { address: extAddress, isConnected } = useAccount();
    const [switching, setSwitching] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    if (!isOpen) return null;

    const linkedWallets = user?.predictions_cache?.linked_wallets;
    const currentAddress = user?.wallet_address?.toLowerCase();
    const currentType = user?.wallet_type;

    // Has Telegram account?
    const hasTgAccount = Boolean(linkedWallets?.telegram || user?.telegram_id || (!user?.whatsapp_phone && currentType === 'bot'));
    // Telegram wallet details
    const tgWallet = linkedWallets?.telegram || (
        hasTgAccount && !user?.whatsapp_phone && currentType === 'bot'
            ? { wallet_index: user?.wallet_index || 0, wallet_address: user?.wallet_address || '' }
            : null
    );

    // Has WhatsApp account?
    const hasWaAccount = Boolean(linkedWallets?.whatsapp || user?.whatsapp_phone);
    // WhatsApp wallet details
    const waWallet = linkedWallets?.whatsapp || (
        hasWaAccount && !user?.telegram_id && currentType === 'bot'
            ? { wallet_index: user?.wallet_index || 0, wallet_address: user?.wallet_address || '' }
            : null
    );

    const isTgActive = currentType === 'bot' && tgWallet && tgWallet.wallet_address.toLowerCase() === currentAddress;
    const isWaActive = currentType === 'bot' && waWallet && waWallet.wallet_address.toLowerCase() === currentAddress;
    const isExtActive = currentType === 'external';

    const copyToClipboard = (text: string, key: string, e: React.MouseEvent) => {
        e.stopPropagation();
        haptic('light');
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const handleSelectBotWallet = async (target: 'telegram' | 'whatsapp') => {
        if (switching) return;
        haptic('medium');
        setSwitching(true);

        try {
            // Local dev mode fallback
            if (!user || user.id === 'dev-user') {
                const targetWallet = target === 'telegram' ? tgWallet : waWallet;
                if (targetWallet) {
                    user!.wallet_address = targetWallet.wallet_address;
                    user!.wallet_type = 'bot';
                }
                await onUserRefresh();
                onSwitchMode('bot');
                setSwitching(false);
                onClose();
                return;
            }

            await api.wallet.switchBot(target);
            await onUserRefresh();
            onSwitchMode('bot');
            haptic('success');
            onClose();
        } catch (err: any) {
            console.error('Failed to switch bot wallet:', err);
            // Fallback to connectBot if needed
            try {
                await api.wallet.connectBot();
                await onUserRefresh();
                onSwitchMode('bot');
                onClose();
            } catch (_) {}
        } finally {
            setSwitching(false);
        }
    };

    const handleSelectExternal = async () => {
        if (switching) return;
        haptic('medium');
        onClose();

        if (isConnected && extAddress) {
            onSwitchMode('external');
            await api.wallet.connectExternal(extAddress).catch(console.error);
            await onUserRefresh();
        } else {
            onSwitchMode('external');
            await appKit.open();
        }
    };

    return (
        <div className="wsm-overlay" onClick={onClose}>
            <div className="wsm-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="wsm-handle" />
                
                <div className="wsm-header">
                    <div className="wsm-title-row">
                        <span className="wsm-title">Select Active Wallet</span>
                        <button className="wsm-close-btn" onClick={onClose}>✕</button>
                    </div>
                    <p className="wsm-subtitle">Choose which wallet to use for trades, deposits & balances</p>
                </div>

                <div className="wsm-list">
                    {/* 1. Telegram Bot Wallet */}
                    <div 
                        className={`wsm-item ${isTgActive ? 'active' : ''}`}
                        onClick={() => handleSelectBotWallet('telegram')}
                    >
                        <div className="wsm-item-icon-wrap tg">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z" fill="currentColor"/>
                            </svg>
                        </div>
                        <div className="wsm-item-body">
                            <div className="wsm-item-head">
                                <span className="wsm-item-name">Telegram Bot Wallet</span>
                                {isTgActive && <span className="wsm-badge active">Active</span>}
                            </div>
                            <div className="wsm-item-desc">
                                {tgWallet?.wallet_address ? (
                                    <div className="wsm-addr-row">
                                        <span className="wsm-addr">
                                            {tgWallet.wallet_address.slice(0, 6)}...{tgWallet.wallet_address.slice(-4)}
                                        </span>
                                        <button 
                                            className="wsm-copy-mini"
                                            onClick={(e) => copyToClipboard(tgWallet.wallet_address, 'tg', e)}
                                        >
                                            {copiedKey === 'tg' ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                ) : (
                                    <span className="wsm-subtext">Primary custodial P2P wallet</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 2. WhatsApp Bot Wallet */}
                    {(waWallet || user?.whatsapp_phone || Boolean(linkedWallets?.whatsapp)) && (
                        <div 
                            className={`wsm-item ${isWaActive ? 'active' : ''}`}
                            onClick={() => handleSelectBotWallet('whatsapp')}
                        >
                            <div className="wsm-item-icon-wrap wa">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                                    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.63C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 6.46 17.5 2 12.04 2ZM12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.44 19.65L5.27 16.62L5.07 16.31C4.24 15 3.81 13.48 3.81 11.91C3.81 7.37 7.5 3.68 12.04 3.68C16.58 3.68 20.27 7.37 20.27 11.91C20.27 16.46 16.58 20.15 12.04 20.15ZM16.54 14.39C16.29 14.26 15.08 13.67 14.86 13.59C14.63 13.51 14.47 13.46 14.31 13.71C14.14 13.96 13.67 14.51 13.53 14.68C13.38 14.84 13.24 14.86 12.99 14.74C12.74 14.61 11.95 14.35 11.01 13.52C10.28 12.87 9.79 12.07 9.64 11.82C9.5 11.57 9.63 11.44 9.75 11.31C9.86 11.2 10 11.02 10.12 10.88C10.24 10.74 10.28 10.63 10.36 10.47C10.45 10.3 10.41 10.16 10.34 10.03C10.28 9.91 9.79 8.7 9.58 8.21C9.38 7.73 9.18 7.8 9.03 7.79C8.89 7.78 8.72 7.78 8.56 7.78C8.39 7.78 8.12 7.84 7.89 8.09C7.66 8.34 7.02 8.94 7.02 10.15C7.02 11.37 7.91 12.54 8.03 12.71C8.16 12.87 9.78 15.37 12.26 16.44C12.85 16.7 13.31 16.85 13.67 16.97C14.26 17.15 14.8 17.13 15.22 17.07C15.7 16.99 16.68 16.47 16.89 15.89C17.09 15.3 17.09 14.81 17.03 14.71C16.97 14.59 16.79 14.52 16.54 14.39Z" fill="currentColor"/>
                                </svg>
                            </div>
                            <div className="wsm-item-body">
                                <div className="wsm-item-head">
                                    <span className="wsm-item-name">WhatsApp Bot Wallet</span>
                                    {isWaActive && <span className="wsm-badge active">Active</span>}
                                </div>
                                <div className="wsm-item-desc">
                                    {waWallet?.wallet_address ? (
                                        <div className="wsm-addr-row">
                                            <span className="wsm-addr">
                                                {waWallet.wallet_address.slice(0, 6)}...{waWallet.wallet_address.slice(-4)}
                                            </span>
                                            <button 
                                                className="wsm-copy-mini"
                                                onClick={(e) => copyToClipboard(waWallet.wallet_address, 'wa', e)}
                                            >
                                                {copiedKey === 'wa' ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                    ) : (
                                        <span className="wsm-subtext">Dedicated WhatsApp trade wallet</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 3. External Web3 Wallet */}
                    <div 
                        className={`wsm-item ${isExtActive ? 'active' : ''}`}
                        onClick={handleSelectExternal}
                    >
                        <div className="wsm-item-icon-wrap ext">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                                <path d="M21 18V19C21 20.1 20.1 21 19 21H5C3.89 21 3 20.1 3 19V5C3 3.9 3.89 3 5 3H19C20.1 3 21 3.9 21 5V6H12C10.89 6 10 6.9 10 8V16C10 17.1 10.89 18 12 18H21ZM12 16H22V8H12V16ZM16 13.5C15.17 13.5 14.5 12.83 14.5 12C14.5 11.17 15.17 10.5 16 10.5C16.83 10.5 17.5 11.17 17.5 12C17.5 12.83 16.83 13.5 16 13.5Z" fill="currentColor"/>
                            </svg>
                        </div>
                        <div className="wsm-item-body">
                            <div className="wsm-item-head">
                                <span className="wsm-item-name">External Web3 Wallet</span>
                                {isExtActive && <span className="wsm-badge active">Active</span>}
                            </div>
                            <div className="wsm-item-desc">
                                {isConnected && extAddress ? (
                                    <div className="wsm-addr-row">
                                        <span className="wsm-addr">
                                            {extAddress.slice(0, 6)}...{extAddress.slice(-4)}
                                        </span>
                                        <button 
                                            className="wsm-copy-mini"
                                            onClick={(e) => copyToClipboard(extAddress, 'ext', e)}
                                        >
                                            {copiedKey === 'ext' ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                ) : (
                                    <span className="wsm-subtext">MetaMask, Rainbow, Trust Wallet</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="wsm-footer">
                    <p className="wsm-footnote">
                        💡 All your funds remain securely in their respective wallets. Switching lets you trade or withdraw directly from that specific wallet.
                    </p>
                </div>
            </div>
        </div>
    );
}
