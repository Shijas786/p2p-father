import React, { useState } from 'react';
import './AuthErrorNotice.css';
import { IconShield } from './Icons';

interface AuthErrorNoticeProps {
    error?: string | null;
    onRetry?: () => void;
}

export const AuthErrorNotice: React.FC<AuthErrorNoticeProps> = ({ error, onRetry }) => {
    const [showDebug, setShowDebug] = useState(false);
    const officialBotUrl = 'https://t.me/p2p_fatherbot';

    const handleOpenBot = () => {
        const tg = (window as any).Telegram?.WebApp;
        if (tg?.openTelegramLink) {
            tg.openTelegramLink(officialBotUrl);
        } else {
            window.open(officialBotUrl, '_blank');
        }
    };

    return (
        <div className="auth-error-container animate-in">
            <div className="auth-error-card">
                <div className="auth-error-icon-wrapper">
                    <IconShield size={32} color="var(--green)" />
                </div>

                <h2 className="auth-error-title">Authentication Required</h2>
                <p className="auth-error-desc">
                    To keep your trades, wallet, and escrow secure, please launch this Mini App through our official verified Telegram bot.
                </p>

                <div className="auth-official-badge">
                    <span className="auth-official-label">Official Telegram Bot</span>
                    <span className="auth-official-handle">@p2p_fatherbot</span>
                </div>

                <div className="auth-actions">
                    <button className="auth-btn-primary" onClick={handleOpenBot}>
                        Open @p2p_fatherbot →
                    </button>

                    {onRetry && (
                        <button className="auth-btn-secondary" onClick={onRetry}>
                            Retry Connection
                        </button>
                    )}
                </div>

                {error && (
                    <div className="auth-debug-details">
                        <span onClick={() => setShowDebug(!showDebug)}>
                            {showDebug ? 'Hide Technical Details ▲' : 'Show Technical Details ▼'}
                        </span>
                        {showDebug && (
                            <div className="auth-debug-box">
                                {error}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
