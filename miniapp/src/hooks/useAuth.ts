import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { isTelegramEnvironment } from '../lib/telegram';

export interface AppUser {
    id: string;
    telegram_id: number;
    username: string | null;
    first_name: string | null;
    photo_url?: string | null;
    wallet_address: string | null;
    wallet_type: 'bot' | 'external';
    wallet_index?: number;
    upi_id: string | null;
    phone_number?: string | null;
    bank_account_number?: string | null;
    bank_ifsc?: string | null;
    bank_name?: string | null;
    digital_rupee_id?: string | null;
    bio?: string | null;
    instagram_handle?: string | null;
    x_handle?: string | null;
    receive_address?: string | null;
    cdm_bank_number?: string | null;
    cdm_bank_name?: string | null;
    cdm_phone?: string | null;
    cdm_user_name?: string | null;
    trade_count: number;
    completed_trades: number;
    trust_score: number;
    predictions_cache?: {
        linked_wallets?: {
            telegram?: { wallet_index: number; wallet_address: string };
            whatsapp?: { wallet_index: number; wallet_address: string };
        };
        last_ip?: string;
        last_seen_at?: string;
    };
    whatsapp_phone?: string | null;
    is_verified: boolean;
    is_admin: boolean;
    created_at?: string;
}

export function useAuth() {
    const [user, setUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const login = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            // Check if URL has ?token=... for Web Trade Room magic link auth
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');

            if (token) {
                try {
                    const res = await api.authWithTradeToken(token);
                    if (res.success && res.initData && res.user) {
                        localStorage.setItem('trade_init_data', res.initData);
                        setUser(res.user);
                        setLoading(false);
                        return;
                    }
                } catch (tokenErr: any) {
                    console.error('[WebTradeAuth] Token auth failed:', tokenErr?.message);
                }
            }

            const isWebAppRoute = window.location.pathname.startsWith('/webapp');

            if (isTelegramEnvironment() || localStorage.getItem('trade_init_data')) {
                const { user: authUser } = await api.auth.login();
                setUser(authUser);
            } else if (isWebAppRoute) {
                // WhatsApp WebApp Route (/webapp): Require WhatsApp OTP login
                setUser(null);
            } else {
                // MiniApp route but NO initData — could be a slow device where
                // the Telegram bridge hasn't injected data yet. Wait 300ms and retry once.
                await new Promise(resolve => setTimeout(resolve, 300));

                if (isTelegramEnvironment()) {
                    // Bridge was just slow — now we have initData, proceed normally
                    const { user: authUser } = await api.auth.login();
                    setUser(authUser);
                } else {
                    // Genuinely no Telegram session (page reload, copied URL, etc.)
                    // Show the AuthErrorNotice — do NOT silently load fake DEV_USER
                    console.warn('[P2PFather] No Telegram initData after retry — showing auth error screen');
                    setUser(null);
                }
            }
        } catch (err: any) {
            // Add debug info for troubleshooting
            const webapp = window.Telegram?.WebApp;
            const debugInfo = [
                err.message,
                `Platform: ${webapp?.platform || 'unknown'}`,
                `Version: ${webapp?.version || 'N/A'}`,
                `InitData: ${webapp?.initData ? 'present' : 'missing'}`,
            ].join('\n');
            setError(debugInfo);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        login();
    }, [login]);

    const refreshUser = useCallback(async () => {
        try {
            const { user: freshUser } = await api.profile.get();
            setUser(freshUser);
        } catch { }
    }, []);

    return { user, loading, error, login, refreshUser, setUser };
}
